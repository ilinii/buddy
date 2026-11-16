//! Persistent source-separated streaming. Interim hypotheses are never evidence.
use super::{
    dsp::RATE,
    runtime::Control,
    types::{Channel, Segment},
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread,
    time::Duration,
};
use tokio::{
    sync::mpsc as queue,
    time::{timeout, Instant},
};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest, http::HeaderValue, protocol::WebSocketConfig, Message,
    },
};

const ENDPOINT: &str = "wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true&endpointing=500&utterance_end_ms=1000&diarize=true&mip_opt_out=true";
pub const PACKET: usize = RATE / 10;
const MAX_BUFFER: usize = RATE * 30;
pub type Updates = Arc<dyn Fn(&str, Channel, Option<Segment>, Option<String>) + Send + Sync>;

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.buddy.meeting", "deepgram-api-key")
        .map_err(|_| "OS credential store is unavailable".into())
}
#[tauri::command]
pub fn set_deepgram_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if !(20..=512).contains(&key.len())
        || !key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("Deepgram API key format is invalid".into());
    }
    credential()?
        .set_password(key)
        .map_err(|_| "Could not save Deepgram key in the OS credential store".into())
}
pub fn read_key() -> Result<String, String> {
    credential()?
        .get_password()
        .map_err(|_| "Save a Deepgram API key before starting live transcription".into())
}
#[tauri::command]
pub fn has_deepgram_key() -> Result<bool, String> {
    match credential()?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("Could not read the OS credential store".into()),
    }
}
#[tauri::command]
pub fn delete_deepgram_key() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove Deepgram key".into()),
    }
}

enum Input {
    Audio(f64, Vec<f32>),
    Flush,
}
pub struct LiveStream {
    tx: Option<queue::Sender<Input>>,
    handle: Option<thread::JoinHandle<Result<(), String>>>,
    shutdown: Arc<AtomicBool>,
}
impl LiveStream {
    pub fn start(
        key: String,
        language: &str,
        channel: Channel,
        session: String,
        ctl: Arc<Control>,
        updates: Updates,
    ) -> Result<Self, String> {
        if !["en", "fr"].contains(&language) {
            return Err("Unsupported streaming language".into());
        }
        Self::open(
            format!("{ENDPOINT}&language={language}"),
            key,
            channel,
            session,
            ctl,
            updates,
        )
    }
    fn open(
        endpoint: String,
        key: String,
        channel: Channel,
        session: String,
        ctl: Arc<Control>,
        updates: Updates,
    ) -> Result<Self, String> {
        let (tx, rx) = queue::channel(128); // at most 12.8 seconds of 100 ms packets
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let shutdown = Arc::new(AtomicBool::new(false));
        let abort = shutdown.clone();
        let worker = thread::Builder::new()
            .name(format!("buddy-deepgram-{}", channel.label()))
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let rt = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                        .map_err(|_| "Could not start streaming runtime")?;
                    rt.block_on(run(
                        endpoint,
                        key,
                        channel,
                        session,
                        ctl.clone(),
                        abort,
                        updates.clone(),
                        rx,
                        ready_tx,
                    ))
                }))
                .unwrap_or_else(|_| Err("The streaming worker stopped unexpectedly".into()));
                if let Err(ref error) = result {
                    ctl.fail(error);
                    updates("error", channel, None, Some(error.clone()));
                }
                result
            })
            .map_err(|_| "Could not start streaming worker")?;
        let stream = Self {
            tx: Some(tx),
            handle: Some(worker),
            shutdown,
        };
        match ready_rx.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(())) => Ok(stream),
            Ok(Err(error)) => Err(error),
            _ => Err("Deepgram did not become ready. No recording was started.".into()),
        }
    }
    pub fn push(&self, start: f64, samples: Vec<f32>) -> Result<(), String> {
        if !start.is_finite()
            || start < 0.
            || samples.is_empty()
            || samples.len() > PACKET
            || samples.iter().any(|v| !v.is_finite())
        {
            return Err("Invalid streaming audio packet".into());
        }
        self.tx.as_ref().ok_or("Streaming session closed")?.try_send(Input::Audio(start, samples))
            .map_err(|_| "Live transcription cannot keep up. Capture stopped instead of silently discarding audio.".into())
    }
    pub fn flush(&self) -> Result<(), String> {
        self.tx
            .as_ref()
            .ok_or("Streaming session closed")?
            .try_send(Input::Flush)
            .map_err(|_| "Streaming flush queue is unavailable".into())
    }
    pub fn finish(mut self) -> Result<(), String> {
        self.tx.take(); // channel close is an ordered finish barrier after all queued PCM
        self.handle
            .take()
            .ok_or("Streaming worker is unavailable")?
            .join()
            .map_err(|_| "Streaming worker stopped unexpectedly")?
    }
}
impl Drop for LiveStream {
    fn drop(&mut self) {
        if self.handle.is_some() {
            self.shutdown.store(true, Ordering::Release);
            self.tx.take();
            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
    }
}

struct Packet {
    offset: u64,
    start: f64,
    pcm: Vec<u8>,
}
impl Packet {
    fn end(&self) -> u64 {
        self.offset + self.pcm.len() as u64 / 2
    }
}
#[derive(Default)]
struct Timeline {
    packets: VecDeque<Packet>,
    total: u64,
    committed: u64,
}
impl Timeline {
    fn push(&mut self, start: f64, audio: Vec<f32>) -> Result<(), String> {
        let pcm: Vec<u8> = audio
            .iter()
            .flat_map(|v| ((v.clamp(-1., 1.) * i16::MAX as f32) as i16).to_le_bytes())
            .collect();
        self.packets.push_back(Packet {
            offset: self.total,
            start,
            pcm,
        });
        self.total += audio.len() as u64;
        if self.total.saturating_sub(self.committed) > MAX_BUFFER as u64 {
            return Err("Deepgram has not finalized 30 seconds of buffered audio. Capture stopped; finalized evidence is safe.".into());
        }
        Ok(())
    }
    fn map(&self, sample: u64, end: bool) -> Result<f64, String> {
        self.packets
            .iter()
            .find(|p| {
                if end {
                    sample > p.offset && sample <= p.end()
                } else {
                    sample >= p.offset && sample < p.end()
                }
            })
            .map(|p| p.start + (sample - p.offset) as f64 / RATE as f64)
            .ok_or("Deepgram timestamps do not match captured audio".into())
    }
    fn commit(&mut self, sample: u64) {
        self.committed = self.committed.max(sample.min(self.total));
        while self
            .packets
            .front()
            .is_some_and(|p| p.end() <= self.committed)
        {
            self.packets.pop_front();
        }
    }
    fn next(&self, cursor: u64) -> Option<Vec<u8>> {
        self.packets
            .iter()
            .find(|p| cursor >= p.offset && cursor < p.end())
            .map(|p| p.pcm[((cursor - p.offset) * 2) as usize..].to_vec())
    }
}

#[derive(Deserialize)]
struct Response {
    start: Option<f64>,
    duration: Option<f64>,
    is_final: Option<bool>,
    channel: Option<Alternatives>,
}
#[derive(Deserialize)]
struct Alternatives {
    alternatives: Vec<Alternative>,
}
#[derive(Deserialize)]
struct Alternative {
    transcript: String,
    #[serde(default)]
    words: Vec<Word>,
}
#[derive(Deserialize)]
struct Word {
    start: f64,
    end: f64,
    word: String,
    punctuated_word: Option<String>,
    speaker: Option<u32>,
}

fn results(
    value: Response,
    timeline: &mut Timeline,
    epoch: u64,
    sent: u64,
    generation: u32,
    channel: Channel,
    session: &str,
    updates: &Updates,
) -> Result<(), String> {
    let start = value.start.ok_or("Deepgram omitted source timestamps")?;
    let duration = value.duration.ok_or("Deepgram omitted result duration")?;
    if !start.is_finite()
        || !duration.is_finite()
        || start < 0.
        || duration < 0.
        || start + duration > (sent - epoch) as f64 / RATE as f64 + 0.25
    {
        return Err("Deepgram returned invalid timestamps".into());
    }
    let window_start = epoch + (start * RATE as f64).round() as u64;
    let window_end = epoch + ((start + duration) * RATE as f64).round() as u64;
    if window_end > sent + RATE as u64 / 4 {
        return Err("Deepgram returned timestamps beyond sent audio".into());
    }
    let window_end = window_end.min(sent);
    let alternative = value
        .channel
        .and_then(|c| c.alternatives.into_iter().next())
        .ok_or("Deepgram omitted transcript alternatives")?;
    if alternative.transcript.len() > 16000 || alternative.words.len() > 2000 {
        return Err("Deepgram transcript exceeded the response limit".into());
    }
    let is_final = value
        .is_final
        .ok_or("Deepgram omitted finalization state")?;
    if !is_final {
        if window_end <= timeline.committed || alternative.transcript.trim().is_empty() {
            return Ok(());
        }
        let a = window_start.max(timeline.committed);
        let segment = Segment {
            id: format!("{session}-deepgram-{}-interim", channel.label()),
            start: timeline.map(a, false)?,
            end: timeline.map(window_end, true)?,
            text: alternative.transcript.trim().into(),
            channel,
            r#final: false,
            speaker: None,
        };
        updates("interim", channel, Some(segment), None);
        return Ok(());
    }
    if window_end <= timeline.committed {
        return Ok(());
    } // replay/delivery duplicate
    let missing_words = alternative.words.is_empty();
    let mut groups: Vec<(u64, u64, Option<u32>, String)> = Vec::new();
    let mut previous = 0.;
    for word in alternative.words {
        if !word.start.is_finite()
            || !word.end.is_finite()
            || word.start < 0.
            || word.end <= word.start
            || word.start < previous
            || word.end > (sent - epoch) as f64 / RATE as f64 + 0.25
            || word.speaker.is_some_and(|s| s > 128)
            || word.word.len() > 1000
            || word
                .punctuated_word
                .as_ref()
                .is_some_and(|s| s.len() > 1000)
        {
            return Err("Deepgram returned invalid word evidence".into());
        }
        previous = word.start;
        let a = epoch + (word.start * RATE as f64).round() as u64;
        let b = epoch + (word.end * RATE as f64).round() as u64;
        if b > sent + RATE as u64 / 4
            || a < window_start.saturating_sub(RATE as u64 / 4)
            || b > window_end + RATE as u64 / 4
        {
            return Err("Deepgram word evidence lies outside the result".into());
        }
        if b <= timeline.committed {
            continue;
        }
        let (a, b) = (a.max(timeline.committed), b.min(sent));
        if b <= a {
            continue;
        }
        let text = word.punctuated_word.unwrap_or(word.word);
        if let Some(group) = groups
            .last_mut()
            .filter(|g| g.2 == word.speaker && a <= g.1 + RATE as u64 * 2)
        {
            group.1 = b;
            group.3.push(' ');
            group.3.push_str(&text);
        } else {
            groups.push((a, b, word.speaker, text));
        }
    }
    if missing_words && !alternative.transcript.trim().is_empty() {
        return Err("Deepgram finalized text without usable word timestamps".into());
    }
    // Validate every group before publishing any of this response.
    if groups.iter().any(|g| g.3.len() > 16000) {
        return Err("Deepgram passage exceeded text limit".into());
    }
    let segments = groups
        .into_iter()
        .map(|(a, b, speaker, text)| {
            Ok(Segment {
                id: format!("{session}-deepgram-{}-{a}-{b}", channel.label()),
                start: timeline.map(a, false)?,
                end: timeline.map(b, true)?,
                text,
                channel,
                r#final: true,
                speaker: speaker.map(|s| {
                    format!(
                        "{} · voice {} · connection {}",
                        channel.label(),
                        s + 1,
                        generation + 1
                    )
                }),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    updates("interim", channel, None, None);
    for segment in segments {
        updates("segment", channel, Some(segment), None);
    }
    timeline.commit(window_end);
    Ok(())
}

async fn cancelled(ctl: &Control, shutdown: &AtomicBool) {
    loop {
        if ctl.cancel.load(Ordering::Acquire) || shutdown.load(Ordering::Acquire) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
async fn connect(
    endpoint: &str,
    key: &str,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    (String, bool),
> {
    let mut request = endpoint
        .into_client_request()
        .map_err(|_| ("Invalid fixed speech endpoint".into(), false))?;
    let mut token = HeaderValue::from_str(&format!("Token {key}"))
        .map_err(|_| ("Invalid Deepgram credential".into(), false))?;
    token.set_sensitive(true);
    request.headers_mut().insert("Authorization", token);
    let config = WebSocketConfig::default()
        .max_message_size(Some(512 * 1024))
        .max_frame_size(Some(512 * 1024));
    match timeout(
        Duration::from_secs(5),
        connect_async_with_config(request, Some(config), true),
    )
    .await
    {
        Ok(Ok((socket, _))) => Ok(socket),
        Ok(Err(tokio_tungstenite::tungstenite::Error::Http(response)))
            if response.status().is_client_error() =>
        {
            Err((
                match response.status().as_u16() {
                    401 | 403 => "Deepgram rejected the key or its permissions",
                    402 | 429 => "Deepgram credit or rate limit reached",
                    _ => "Deepgram rejected the streaming configuration",
                }
                .into(),
                false,
            ))
        }
        _ => Err(("Deepgram streaming connection failed".into(), true)),
    }
}

async fn run(
    endpoint: String,
    key: String,
    channel: Channel,
    session: String,
    ctl: Arc<Control>,
    shutdown: Arc<AtomicBool>,
    updates: Updates,
    mut rx: queue::Receiver<Input>,
    ready: mpsc::SyncSender<Result<(), String>>,
) -> Result<(), String> {
    let mut timeline = Timeline::default();
    let mut finishing = false;
    let mut flush_at = VecDeque::new();
    let mut retries = 0u32;
    let mut generation = 0;
    let mut ever_ready = false;
    'connection: loop {
        let connection = tokio::select! { v=connect(&endpoint,&key)=>v, _=cancelled(&ctl,&shutdown)=>return Ok(()) };
        let socket = match connection {
            Ok(v) => v,
            Err((message, retryable)) => {
                if !ever_ready || !retryable || retries >= 3 {
                    let _ = ready.send(Err(message.clone()));
                    return Err(message);
                }
                retries += 1;
                updates(
                    "transport",
                    channel,
                    None,
                    Some(format!(
                        "Reconnecting {} · attempt {retries}/3",
                        channel.label()
                    )),
                );
                tokio::select! { _=tokio::time::sleep(Duration::from_millis(250 * (1 << retries)))=>{}, _=cancelled(&ctl,&shutdown)=>return Ok(()) }
                continue;
            }
        };
        if !ever_ready {
            let _ = ready.send(Ok(()));
            ever_ready = true;
        }
        updates(
            "transport",
            channel,
            None,
            Some(if generation == 0 {
                "Live connection ready".into()
            } else {
                "Connection restored · replaying buffered audio".into()
            }),
        );
        let epoch = timeline.committed;
        let mut sent = epoch;
        let mut next_send = Instant::now();
        let mut last_write = Instant::now();
        let connected = Instant::now();
        let mut closed_at = None;
        let (mut writer, mut reader) = socket.split();
        let mut tick = tokio::time::interval(Duration::from_millis(20));
        let outcome: Result<(), String> = loop {
            tokio::select! {
                _=cancelled(&ctl,&shutdown)=>return Ok(()),
                input=rx.recv(), if !finishing => match input {
                    Some(Input::Audio(start,samples))=> { timeline.push(start,samples)?; },
                    Some(Input::Flush)=>{if flush_at.back()!=Some(&timeline.total){if flush_at.len()>=32{return Err("Too many pending speech boundaries; capture stopped safely".into());}flush_at.push_back(timeline.total);}},
                    None=>finishing=true,
                },
                incoming=reader.next()=>match incoming {
                    Some(Ok(Message::Text(text)))=> {
                        let envelope: serde_json::Value = serde_json::from_str(&text).map_err(|_| "Deepgram returned malformed streaming data")?;
                        match envelope.get("type").and_then(|v|v.as_str()).ok_or("Deepgram omitted the response type")? {
                            "Results"=>{let value:Response=serde_json::from_value(envelope).map_err(|_| "Deepgram returned malformed transcript data")?;results(value,&mut timeline,epoch,sent,generation,channel,&session,&updates)?;},
                            "Metadata" if closed_at.is_some()=>return Ok(()),
                            "Error"=>return Err("Deepgram reported a streaming error. Check account quota and speech access.".into()),
                            _=>{},
                        }
                    },
                    Some(Ok(Message::Ping(bytes)))=> { if !timeout(Duration::from_secs(2),writer.send(Message::Pong(bytes))).await.is_ok_and(|v|v.is_ok()) { break Err("Deepgram connection became unresponsive".into()); } },
                    Some(Ok(Message::Close(_)))|None=>break Err("Deepgram connection closed before finalization".into()),
                    Some(Err(_))=>break Err("Deepgram streaming connection was interrupted".into()),
                    _=>{},
                },
                _=tick.tick()=> {
                    if closed_at.is_some_and(|at:Instant|at.elapsed()>Duration::from_secs(12)) { return Err("Deepgram finalization timed out. Saved final passages remain available.".into()); }
                    if connected.elapsed()>Duration::from_secs(30) { retries=0; }
                    let message = if closed_at.is_some() { None }
                        else if flush_at.front().is_some_and(|at|sent>=*at) { flush_at.pop_front();Some(Message::text(r#"{"type":"Finalize"}"#)) }
                        else if sent < timeline.total && Instant::now()>=next_send { timeline.next(sent).map(Message::binary) }
                        else if sent==timeline.total && finishing { closed_at=Some(Instant::now());Some(Message::text(r#"{"type":"CloseStream"}"#)) }
                        else if last_write.elapsed()>=Duration::from_secs(3) { Some(Message::text(r#"{"type":"KeepAlive"}"#)) }
                        else { None };
                    if let Some(message)=message {
                        let samples=if let Message::Binary(ref bytes)=message {bytes.len()/2} else {0};
                        let send = tokio::select! { v=timeout(Duration::from_secs(2),writer.send(message))=>v.is_ok_and(|v|v.is_ok()), _=cancelled(&ctl,&shutdown)=>return Ok(()) };
                        if !send { break Err("Deepgram audio delivery failed".into()); }
                        sent+=samples as u64;
                        next_send=Instant::now()+Duration::from_secs_f64(samples as f64/RATE as f64/1.25);
                        last_write=Instant::now();
                    }
                }
            }
        };
        if retries >= 3 {
            return outcome;
        }
        retries += 1;
        generation += 1;
        updates("interim", channel, None, None);
        updates(
            "transport",
            channel,
            None,
            Some(format!(
                "Reconnecting {} · attempt {retries}/3",
                channel.label()
            )),
        );
        tokio::select! { _=tokio::time::sleep(Duration::from_millis(250*(1<<retries)))=>{}, _=cancelled(&ctl,&shutdown)=>return Ok(()) }
        continue 'connection;
    }
}

#[cfg(test)]
mod tests;
