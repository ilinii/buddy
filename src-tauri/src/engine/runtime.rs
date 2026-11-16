use super::{
    asr::{SpeechBackend, WhisperBackend},
    capture::{self, Frame},
    deepgram::{self, LiveStream},
    dsp::{rms, Normalizer, RATE},
    groq::GroqBackend,
    types::*,
};
use std::{
    collections::HashMap,
    fs,
    io::BufWriter,
    path::PathBuf,
    sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
    sync::{
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
pub struct Control {
    capture_epoch: AtomicU64,
    capture_ready: AtomicBool,
    stop: AtomicBool,
    pause: AtomicBool,
    pause_clock: Mutex<(Instant, Option<Instant>, Duration)>,
    pub level: AtomicU32,
    pub fatal: Mutex<Option<String>>,
    pub cancel: Arc<AtomicBool>,
}
impl Control {
    pub fn new() -> Self {
        Self {
            capture_epoch: AtomicU64::new(0),
            capture_ready: AtomicBool::new(false),
            stop: AtomicBool::new(false),
            pause: AtomicBool::new(false),
            pause_clock: Mutex::new((Instant::now(), None, Duration::ZERO)),
            level: AtomicU32::new(0),
            fatal: Mutex::new(None),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn stopped(&self) -> bool {
        self.stop.load(Ordering::Acquire)
    }
    pub fn capturing(&self) -> bool {
        self.capture_ready.load(Ordering::Acquire)
    }
    fn arm_capture(&self) -> bool {
        let mut clock = self.pause_clock.lock().unwrap();
        if self.stopped() {
            return false;
        }
        *clock = (Instant::now(), None, Duration::ZERO);
        self.capture_ready.store(true, Ordering::Release);
        true
    }
    pub fn paused(&self) -> bool {
        self.pause.load(Ordering::Acquire)
    }
    pub fn epoch(&self) -> u64 {
        self.capture_epoch.load(Ordering::Acquire)
    }
    pub fn elapsed(&self) -> f64 {
        let c = self.pause_clock.lock().unwrap();
        (c.1.unwrap_or_else(Instant::now)
            .duration_since(c.0)
            .saturating_sub(c.2))
        .as_secs_f64()
    }
    pub fn set_pause(&self, p: bool) {
        let mut c = self.pause_clock.lock().unwrap();
        if p && c.1.is_none() {
            self.capture_epoch.fetch_add(1, Ordering::AcqRel);
            c.1 = Some(Instant::now());
        } else if !p {
            if let Some(start) = c.1.take() {
                c.2 += start.elapsed();
            }
        }
        self.pause.store(p, Ordering::Release);
    }
    pub fn stop(&self) {
        let mut c = self.pause_clock.lock().unwrap();
        if c.1.is_none() {
            c.1 = Some(Instant::now());
        }
        self.stop.store(true, Ordering::Release);
    }
    pub fn fail(&self, message: &str) {
        let mut fatal = self.fatal.lock().unwrap();
        if fatal.is_none() {
            *fatal = Some(message.into());
        }
        self.stop();
    }
}
pub type Sink = Arc<dyn Fn(EngineEvent) + Send + Sync>;
fn join_captures(handles: Vec<thread::JoinHandle<()>>, limit: Duration) -> Result<(), String> {
    let deadline = Instant::now() + limit;
    while handles.iter().any(|handle| !handle.is_finished()) {
        if Instant::now() >= deadline {
            return Err("Audio driver shutdown timed out. Its resources are still releasing; saved transcript remains available. Wait before retrying or restart Buddy.".into());
        }
        thread::sleep(Duration::from_millis(10));
    }
    for handle in handles {
        handle
            .join()
            .map_err(|_| "An audio capture worker stopped unexpectedly")?;
    }
    Ok(())
}
#[derive(Clone)]
pub struct Session {
    pub control: Arc<Control>,
    pub snapshot: Arc<Mutex<SessionSnapshot>>,
    pub done: Arc<AtomicBool>,
}
pub struct Journal {
    path: PathBuf,
    pub snapshot: Arc<Mutex<SessionSnapshot>>,
    sink: Sink,
    sequence: Mutex<u64>,
    control: Arc<Control>,
}
impl Journal {
    fn emit(&self, kind: &str, message: Option<String>, segment: Option<Segment>) {
        self.publish(kind, None, message, segment);
    }
    fn publish(
        &self,
        kind: &str,
        source: Option<Channel>,
        message: Option<String>,
        segment: Option<Segment>,
    ) {
        let mut snap = self.snapshot.lock().unwrap();
        snap.duration = if snap.status == "starting" {
            0.
        } else {
            self.control.elapsed()
        };
        if let Some(ref s) = segment {
            if s.r#final && !snap.segments.iter().any(|old| old.id == s.id) {
                snap.segments.push(s.clone());
            }
        }
        if let Some(ref m) = message {
            if kind == "warning" || kind == "error" {
                snap.warnings.push(m.clone());
                snap.warnings.truncate(32);
            }
        }
        let mut seq = self.sequence.lock().unwrap();
        *seq += 1;
        snap.sequence = *seq;
        let mut event = EngineEvent {
            session_id: snap.session_id.clone(),
            meeting_id: snap.meeting_id.clone(),
            sequence: *seq,
            kind: kind.into(),
            status: snap.status.clone(),
            duration: snap.duration,
            level: f32::from_bits(self.control.level.load(Ordering::Acquire)),
            message,
            segment,
            source,
        };
        if !["level", "interim", "transport"].contains(&kind) {
            if let Err(e) = self.save(&snap) {
                let message = format!("Transcript journal could not be saved: {e}");
                self.control.fail(&message);
                snap.warnings.push(message.clone());
                snap.warnings.truncate(32);
                event.kind = "error".into();
                event.message = Some(message);
            }
        }
        drop(snap);
        (self.sink)(event);
    }
    fn save(&self, snapshot: &SessionSnapshot) -> Result<(), String> {
        let mut file =
            atomic_write_file::AtomicWriteFile::open(&self.path).map_err(|e| e.to_string())?;
        serde_json::to_writer(&mut file, snapshot).map_err(|e| e.to_string())?;
        file.commit().map_err(|e| e.to_string())
    }
}
struct Chunk {
    channel: Channel,
    start: f64,
    batch: u64,
    samples: Vec<f32>,
}
// Credentials stay in native memory and are never part of a request/journal/event.
pub enum SpeechConfig {
    Local(PathBuf),
    Groq(String),
    Deepgram(String),
}
struct Track {
    epoch: u64,
    normal: Normalizer,
    samples: Vec<f32>,
    start: f64,
    batch: u64,
    rate: u32,
    writer: Option<hound::WavWriter<BufWriter<fs::File>>>,
    written: u64,
    quiet: usize,
    frame_end: Option<f64>,
}
impl Track {
    fn boundary(
        &mut self,
        source: Channel,
        stream: Option<&LiveStream>,
        asr: &Option<SyncSender<Chunk>>,
        ctl: &Control,
    ) -> Result<(), String> {
        let tail = self.normal.finish()?;
        if let Some(writer) = &mut self.writer {
            for sample in &tail {
                writer
                    .write_sample((sample.clamp(-1., 1.) * i16::MAX as f32) as i16)
                    .map_err(|e| e.to_string())?;
            }
            writer.flush().map_err(|e| e.to_string())?;
            self.written += tail.len() as u64;
        }
        self.samples.extend(tail);
        if let Some(stream) = stream {
            self.stream(stream, true)?;
            stream.flush()?;
        } else {
            self.dispatch(source, asr, ctl, false)?;
        }
        self.normal = Normalizer::new(self.rate)?;
        self.quiet = 0;
        self.frame_end = None;
        self.start = ctl.elapsed();
        Ok(())
    }
    fn stream(&mut self, stream: &LiveStream, tail: bool) -> Result<(), String> {
        while self.samples.len() >= deepgram::PACKET || (tail && !self.samples.is_empty()) {
            let count = self.samples.len().min(deepgram::PACKET);
            let audio = self.samples[..count].to_vec();
            stream.push(self.start, audio)?;
            self.samples.drain(..count);
            self.start += count as f64 / RATE as f64;
        }
        Ok(())
    }
    fn dispatch(
        &mut self,
        channel: Channel,
        asr: &Option<SyncSender<Chunk>>,
        ctl: &Control,
        finalizing: bool,
    ) -> Result<(), String> {
        if self.samples.is_empty() {
            return Ok(());
        }
        let samples = std::mem::take(&mut self.samples);
        if let Some(tx) = asr {
            let chunk = Chunk {
                channel,
                start: self.start,
                batch: self.batch,
                samples,
            };
            if finalizing {
                tx.send(chunk).map_err(|_| {
                    "Speech worker stopped before pending audio could be transcribed".to_string()
                })?;
            } else if let Err(error) = tx.try_send(chunk) {
                match error {
                    mpsc::TrySendError::Full(chunk) => {
                        self.samples = chunk.samples;
                        return Err("Transcription backlog reached its limit. Capture stopped; pending audio is being finalized.".into());
                    }
                    mpsc::TrySendError::Disconnected(_) => {
                        return Err("Speech worker disconnected".into())
                    }
                }
            }
        }
        self.batch += 1;
        self.start = ctl.elapsed();
        Ok(())
    }
}
pub fn start(
    request: StartRequest,
    base: PathBuf,
    speech: Option<SpeechConfig>,
    sink: Sink,
) -> Result<Session, String> {
    request.validate()?;
    let session_id = uuid::Uuid::new_v4().to_string();
    let dir = base.join("sessions").join(&session_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let control = Arc::new(Control::new());
    let snapshot = Arc::new(Mutex::new(SessionSnapshot {
        schema_version: 1,
        sequence: 0,
        model: if request.transcribe {
            Some(if request.speech_provider == SpeechProvider::Deepgram {
                "deepgram/nova-3".into()
            } else if request.speech_provider == SpeechProvider::Groq {
                "groq/whisper-large-v3-turbo".into()
            } else {
                request.model.clone()
            })
        } else {
            None
        },
        language: if request.transcribe {
            Some(request.language.clone())
        } else {
            None
        },
        sources: [Channel::Microphone, Channel::System]
            .into_iter()
            .filter(|c| match c {
                Channel::Microphone => request.microphone,
                Channel::System => request.system_audio,
            })
            .collect(),
        session_id: session_id.clone(),
        meeting_id: request.meeting_id.clone(),
        started_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        status: "starting".into(),
        duration: 0.0,
        segments: Vec::new(),
        retained_audio: request.retain_audio,
        transcribing: request.transcribe,
        warnings: Vec::new(),
    }));
    let journal = Arc::new(Journal {
        path: dir.join("session.json"),
        snapshot: snapshot.clone(),
        sink,
        sequence: Mutex::new(0),
        control: control.clone(),
    });
    let done = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let ctl = control.clone();
    let work_done = done.clone();
    thread::Builder::new()
        .name("buddy-meeting-engine".into())
        .spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(||run(request,dir,speech,journal.clone(),ready_tx,ctl.clone()))).unwrap_or_else(|_|{ctl.cancel.store(true,Ordering::Release);ctl.stop();Err("The native audio worker stopped unexpectedly; saved transcript evidence is retained".into())});
            if let Err(ref error) = result {
                ctl.fail(error);
                journal.emit("error", Some(error.clone()), None);
            }
            journal.snapshot.lock().unwrap().status = if ctl.fatal.lock().unwrap().is_some() {
                "interrupted"
            } else {
                "complete"
            }
            .into();
            journal.emit("finished", None, None);
            work_done.store(true, Ordering::Release);
        })
        .map_err(|e| e.to_string())?;
    drop(ready_rx);
    Ok(Session {
        control,
        snapshot,
        done,
    })
}
fn run(
    request: StartRequest,
    dir: PathBuf,
    speech: Option<SpeechConfig>,
    journal: Arc<Journal>,
    ready: SyncSender<Result<(), String>>,
    ctl: Arc<Control>,
) -> Result<(), String> {
    let mut streams: HashMap<Channel, LiveStream> = HashMap::new();
    let backend: Option<Box<dyn SpeechBackend>> = match speech {
        Some(SpeechConfig::Local(path)) => Some(Box::new(WhisperBackend::load(
            &path,
            &request.language,
            ctl.cancel.clone(),
        )?)),
        Some(SpeechConfig::Groq(key)) => Some(Box::new(GroqBackend::new(
            key,
            request.language.clone(),
            ctl.cancel.clone(),
        )?)),
        Some(SpeechConfig::Deepgram(key)) => {
            let j = journal.clone();
            let updates: deepgram::Updates = Arc::new(move |kind, source, segment, message| {
                j.publish(kind, Some(source), message, segment)
            });
            let session = journal.snapshot.lock().unwrap().session_id.clone();
            for source in [Channel::Microphone, Channel::System] {
                if (source == Channel::Microphone && request.microphone)
                    || (source == Channel::System && request.system_audio)
                {
                    streams.insert(
                        source,
                        LiveStream::start(
                            key.clone(),
                            &request.language,
                            source,
                            session.clone(),
                            ctl.clone(),
                            updates.clone(),
                        )?,
                    );
                }
            }
            None
        }
        None => None,
    };
    // Avoid many tiny billable uploads; local inference keeps its shorter endpoints.
    let (min_chunk, max_chunk) = if request.speech_provider == SpeechProvider::Groq {
        (10, 20)
    } else {
        (2, 12)
    };
    let (tx, rx) = mpsc::sync_channel::<Frame>(128);
    let mut captures = Vec::new();
    for channel in [Channel::Microphone, Channel::System] {
        if (channel == Channel::Microphone && !request.microphone)
            || (channel == Channel::System && !request.system_audio)
        {
            continue;
        }
        let (r_tx, r_rx) = mpsc::sync_channel(1);
        let capture_ctl = ctl.clone();
        let capture_tx = tx.clone();
        let device = request.device_id.clone();
        captures.push(thread::spawn(move || match channel {
            Channel::Microphone => capture::microphone(device, capture_tx, capture_ctl, r_tx),
            Channel::System => capture::system(capture_tx, capture_ctl, r_tx),
        }));
        match r_rx.recv_timeout(Duration::from_secs(6)) {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                ctl.stop();
                let _ = join_captures(captures, Duration::from_secs(2));
                let _ = ready.send(Err(e.clone()));
                return Err(e);
            }
            Err(_) => {
                ctl.stop();
                let _ = join_captures(captures, Duration::from_secs(2));
                let e = "Audio device did not respond in time".to_string();
                let _ = ready.send(Err(e.clone()));
                return Err(e);
            }
        }
    }
    drop(tx);
    let (asr_tx, asr_worker) = if let Some(backend) = backend {
        let (tx, rx) = mpsc::sync_channel::<Chunk>(6);
        let j = journal.clone();
        let control = ctl.clone();
        let session = journal.snapshot.lock().unwrap().session_id.clone();
        let worker = thread::spawn(move || {
            while let Ok(chunk) = rx.recv() {
                if control.cancel.load(Ordering::Acquire) {
                    break;
                }
                match backend.transcribe(
                    &chunk.samples,
                    chunk.start,
                    chunk.channel,
                    &session,
                    chunk.batch,
                ) {
                    Ok(segments) => {
                        for segment in segments {
                            j.emit("segment", None, Some(segment));
                        }
                    }
                    Err(error) => {
                        control.fail(&error);
                        j.emit("error", Some(error), None);
                        break;
                    }
                }
            }
        });
        (Some(tx), Some(worker))
    } else {
        (None, None)
    };
    if !ctl.arm_capture() {
        drop(asr_tx);
        if let Some(worker) = asr_worker {
            let _ = worker.join();
        }
        let _ = join_captures(captures, Duration::from_secs(2));
        return Err("Recording stopped before all audio sources became ready".into());
    }
    journal.snapshot.lock().unwrap().status = "live".into();
    journal.emit("started", None, None);
    let _ = ready.send(Ok(()));
    let mut tracks: HashMap<Channel, Track> = HashMap::new();
    let mut last = Instant::now();
    let mut checkpoint = Instant::now();
    let mut was_paused = false;
    let mut microphone_delivery = Instant::now();
    let processing = (|| -> Result<(), String> {
        loop {
            if ctl.paused() {
                microphone_delivery = Instant::now();
            }
            if request.microphone
                && !ctl.paused()
                && !ctl.stopped()
                && microphone_delivery.elapsed() > Duration::from_secs(8)
            {
                return Err("Microphone stopped delivering audio. Capture stopped; reconnect the selected device before recording again.".into());
            }
            if ctl.elapsed() > 4.0 * 3600.0 {
                ctl.fail("Recording reached the four-hour session limit");
            }
            if ctl.paused() != was_paused {
                was_paused = ctl.paused();
                journal.snapshot.lock().unwrap().status =
                    if was_paused { "paused" } else { "live" }.into();
                journal.emit("state", None, None);
            }
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(frame) => {
                    if frame.channel == Channel::Microphone {
                        microphone_delivery = Instant::now();
                    }
                    if !tracks.contains_key(&frame.channel) {
                        let writer = if request.retain_audio {
                            Some(
                                hound::WavWriter::create(
                                    dir.join(format!("{}.wav", frame.channel.label())),
                                    hound::WavSpec {
                                        channels: 1,
                                        sample_rate: RATE as u32,
                                        bits_per_sample: 16,
                                        sample_format: hound::SampleFormat::Int,
                                    },
                                )
                                .map_err(|e| e.to_string())?,
                            )
                        } else {
                            None
                        };
                        tracks.insert(
                            frame.channel,
                            Track {
                                epoch: frame.epoch,
                                normal: Normalizer::new(frame.rate)?,
                                samples: Vec::with_capacity(RATE * 12),
                                start: frame.start,
                                batch: 0,
                                rate: frame.rate,
                                writer,
                                written: 0,
                                quiet: 0,
                                frame_end: None,
                            },
                        );
                    }
                    let track = tracks.get_mut(&frame.channel).unwrap();
                    if frame.epoch != track.epoch {
                        if frame.epoch < track.epoch {
                            return Err("Audio capture boundary moved backwards".into());
                        }
                        track.boundary(
                            frame.channel,
                            streams.get(&frame.channel),
                            &asr_tx,
                            &ctl,
                        )?;
                        track.epoch = frame.epoch;
                        track.start = frame.start;
                    }
                    if track.rate != frame.rate {
                        return Err(
                            "Audio format changed; restart recording with the selected device"
                                .into(),
                        );
                    }
                    let samples = track.normal.push(&frame.samples)?;
                    if let Some(stream) = streams.get(&frame.channel) {
                        if track.frame_end.is_some_and(|end| frame.start > end + 0.5) {
                            track.stream(stream, true)?;
                            journal.emit("warning",Some(format!("{} audio delivery gap detected; transcript timing preserves the gap",frame.channel.label())),None);
                            track.start = frame.start;
                        }
                    }
                    track.frame_end =
                        Some(frame.start + frame.samples.len() as f64 / frame.rate as f64);
                    ctl.level.store(rms(&samples).to_bits(), Ordering::Release);
                    if let Some(writer) = &mut track.writer {
                        for sample in &samples {
                            writer
                                .write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                                .map_err(|e| e.to_string())?;
                        }
                        track.written += samples.len() as u64;
                        if track.written > RATE as u64 * 3600 * 4 {
                            return Err("Audio retention limit reached".into());
                        }
                    }
                    if !streams.contains_key(&frame.channel) && track.samples.is_empty() {
                        track.start = frame.start;
                    }
                    track.quiet = if rms(&samples) < 0.006 {
                        track.quiet + samples.len()
                    } else {
                        0
                    };
                    track.samples.extend(samples);
                    if let Some(stream) = streams.get(&frame.channel) {
                        track.stream(stream, false)?;
                    } else if track.samples.len() >= RATE * max_chunk
                        || (track.samples.len() >= RATE * min_chunk && track.quiet >= RATE * 3 / 5)
                    {
                        track.dispatch(frame.channel, &asr_tx, &ctl, false)?;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if ctl.paused() {
                        for (source, track) in &mut tracks {
                            if track.epoch != ctl.epoch() {
                                track.boundary(*source, streams.get(source), &asr_tx, &ctl)?;
                                track.epoch = ctl.epoch();
                            }
                        }
                    }
                    if ctl.stopped() {
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            if checkpoint.elapsed() >= Duration::from_secs(5) {
                journal.emit("state", None, None);
                checkpoint = Instant::now();
            }
            if last.elapsed() >= Duration::from_millis(200) {
                journal.emit("level", None, None);
                last = Instant::now();
            }
        }
        Ok(())
    })();
    ctl.stop();
    let capture_cleanup = join_captures(captures, Duration::from_secs(2));
    if let Err(error) = &capture_cleanup {
        ctl.fail(error);
        journal.emit("warning", Some(error.clone()), None);
    }
    journal.snapshot.lock().unwrap().status = "finalizing".into();
    journal.emit("state", None, None);
    let flush = (|| -> Result<(), String> {
        for (channel, track) in &mut tracks {
            let tail = track.normal.finish()?;
            if let Some(writer) = &mut track.writer {
                for sample in &tail {
                    writer
                        .write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                        .map_err(|e| e.to_string())?;
                }
                writer.flush().map_err(|e| e.to_string())?;
            }
            track.samples.extend(tail);
            let result = if let Some(stream) = streams.get(channel) {
                track.stream(stream, true)
            } else {
                track.dispatch(*channel, &asr_tx, &ctl, true)
            };
            if let Err(e) = result {
                ctl.fail(&e);
            }
        }
        for (_, mut track) in tracks {
            if let Some(writer) = track.writer.take() {
                writer.finalize().map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })();
    drop(asr_tx);
    if let Some(worker) = asr_worker {
        if worker.join().is_err() {
            return Err("Speech worker stopped unexpectedly".into());
        }
    }
    for (_, stream) in streams {
        if let Err(e) = stream.finish() {
            ctl.fail(&e);
            journal.emit("error", Some(e), None);
        }
    }
    processing.and(flush).and(capture_cleanup)
}
pub fn event_sink(app: tauri::AppHandle) -> Sink {
    Arc::new(move |event| {
        let _ = app.emit("meeting-engine", event);
    })
}
pub fn session_paths(base: &std::path::Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(entries) = fs::read_dir(base.join("sessions")) {
        for entry in entries.flatten().take(10000) {
            if uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err()
                || !entry.file_type().is_ok_and(|t| t.is_dir())
            {
                continue;
            }
            let path = entry.path().join("session.json");
            if let Ok(meta) = fs::metadata(&path) {
                if meta.len() <= 8_000_000 {
                    paths.push((meta.modified().ok(), path));
                }
            }
        }
    }
    paths.sort_by(|a, b| b.0.cmp(&a.0));
    paths.into_iter().map(|p| p.1).collect()
}
pub fn read_session(path: &std::path::Path) -> Option<SessionSnapshot> {
    let bytes = fs::read(path).ok()?;
    let session: SessionSnapshot = serde_json::from_slice(&bytes).ok()?;
    if session.schema_version != 1
        || uuid::Uuid::parse_str(&session.session_id).is_err()
        || uuid::Uuid::parse_str(&session.meeting_id).is_err()
        || path.parent()?.file_name()?.to_str()? != session.session_id
    {
        return None;
    }
    Some(session)
}
pub fn recover(base: &std::path::Path) -> Vec<SessionSnapshot> {
    session_paths(base)
        .into_iter()
        .take(100)
        .filter_map(|path| {
            let mut s = read_session(&path)?;
            if ["live", "paused", "starting", "finalizing"].contains(&s.status.as_str()) {
                s.status = "interrupted".into();
            }
            Some(s)
        })
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paused_clock_does_not_advance() {
        let c = Control::new();
        c.set_pause(true);
        let before = c.elapsed();
        thread::sleep(Duration::from_millis(5));
        assert_eq!(before, c.elapsed());
        c.set_pause(false);
        assert!(c.elapsed() >= before);
    }
}
#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    #[test]
    fn stalled_driver_cleanup_is_bounded_and_late_worker_can_release() {
        let (tx, rx) = mpsc::channel();
        let (done, completed) = mpsc::channel();
        let worker = thread::spawn(move || {
            rx.recv().unwrap();
            done.send(()).unwrap();
        });
        let start = Instant::now();
        assert!(join_captures(vec![worker], Duration::from_millis(20)).is_err());
        assert!(start.elapsed() < Duration::from_secs(1));
        tx.send(()).unwrap();
        completed.recv_timeout(Duration::from_secs(1)).unwrap();
    }
    #[test]
    fn pause_flushes_resampler_tail_and_keeps_resumed_speech_in_a_separate_chunk() {
        let ctl = Control::new();
        let (tx, rx) = mpsc::sync_channel(2);
        let mut track = Track {
            epoch: 0,
            normal: Normalizer::new(48000).unwrap(),
            samples: vec![],
            start: 10.,
            batch: 0,
            rate: 48000,
            writer: None,
            written: 0,
            quiet: 0,
            frame_end: None,
        };
        track
            .samples
            .extend(track.normal.push(&vec![0.3; 4800]).unwrap());
        ctl.set_pause(true);
        let epoch = ctl.epoch();
        ctl.set_pause(true);
        assert_eq!(ctl.epoch(), epoch);
        track
            .boundary(Channel::Microphone, None, &Some(tx.clone()), &ctl)
            .unwrap();
        let first = rx.try_recv().unwrap();
        assert_eq!(first.samples.len(), 1600);
        assert_eq!(first.start, 10.);
        assert_eq!(first.batch, 0);
        ctl.set_pause(false);
        track.start = 20.;
        track
            .samples
            .extend(track.normal.push(&vec![-0.3; 4800]).unwrap());
        track
            .boundary(Channel::Microphone, None, &Some(tx), &ctl)
            .unwrap();
        let second = rx.try_recv().unwrap();
        assert_eq!(second.start, 20.);
        assert_eq!(second.batch, 1);
        assert_eq!(second.samples.len(), 1600);
        assert!(first.samples.iter().sum::<f32>() / 1600. > 0.2);
        assert!(second.samples.iter().sum::<f32>() / 1600. < -0.2);
    }
    fn root() -> PathBuf {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../output/engine-tests");
        fs::create_dir_all(&root).unwrap();
        root.canonicalize().unwrap()
    }
    fn temporary() -> PathBuf {
        let path = root().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&path).unwrap();
        path
    }
    fn cleanup(path: &std::path::Path) {
        assert!(path.canonicalize().unwrap().starts_with(root()));
        fs::remove_dir_all(path).unwrap();
    }
    fn snapshot() -> SessionSnapshot {
        SessionSnapshot {
            schema_version: 1,
            sequence: 0,
            model: None,
            language: None,
            sources: vec![Channel::Microphone],
            session_id: uuid::Uuid::new_v4().to_string(),
            meeting_id: uuid::Uuid::new_v4().to_string(),
            started_at: 1,
            status: "live".into(),
            duration: 0.0,
            segments: vec![],
            retained_audio: false,
            transcribing: false,
            warnings: vec![],
        }
    }
    #[test]
    fn stop_freezes_duration_while_asr_drains() {
        let ctl = Control::new();
        ctl.stop();
        let stopped = ctl.elapsed();
        thread::sleep(Duration::from_millis(5));
        assert_eq!(stopped, ctl.elapsed());
    }
    #[test]
    fn capture_gate_prevents_startup_backlog_until_all_devices_are_ready() {
        let ctl = Control::new();
        let (tx, rx) = mpsc::sync_channel(1);
        for _ in 0..200 {
            capture::deliver_frame(&tx, &ctl, Channel::Microphone, vec![0.; 160], 16000, 0.);
        }
        assert!(rx.try_recv().is_err());
        assert!(!ctl.stopped());
        assert!(ctl.arm_capture());
        capture::deliver_frame(&tx, &ctl, Channel::Microphone, vec![0.; 160], 16000, 0.);
        assert_eq!(rx.try_recv().unwrap().samples.len(), 160);
        ctl.set_pause(true);
        capture::deliver_frame(&tx, &ctl, Channel::Microphone, vec![0.; 160], 16000, 0.);
        assert!(rx.try_recv().is_err());
    }
    #[test]
    fn failed_model_start_releases_session_and_recovers_honestly() {
        let base = temporary();
        let request = StartRequest {
            meeting_id: uuid::Uuid::new_v4().to_string(),
            language: "en".into(),
            model: "whisper-base".into(),
            microphone: true,
            system_audio: false,
            device_id: None,
            retain_audio: false,
            transcribe: true,
            speech_provider: SpeechProvider::Local,
            cloud_audio_consent: false,
        };
        let session = start(
            request,
            base.clone(),
            Some(SpeechConfig::Local(base.join("missing-model.bin"))),
            Arc::new(|_| {}),
        )
        .unwrap();
        for _ in 0..100 {
            if session.done.load(Ordering::Acquire) {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(session.done.load(Ordering::Acquire));
        assert_eq!(session.snapshot.lock().unwrap().status, "interrupted");
        let recovered = recover(&base);
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].status, "interrupted");
        assert!(recovered[0].segments.is_empty());
        assert!(!recovered[0].warnings.is_empty());
        cleanup(&base);
    }
    #[test]
    fn journal_deduplicates_segments_and_survives_restart() {
        let base = temporary();
        let snapshot = snapshot();
        let dir = base.join("sessions").join(&snapshot.session_id);
        fs::create_dir_all(&dir).unwrap();
        let ctl = Arc::new(Control::new());
        *ctl.pause_clock.lock().unwrap() = (
            Instant::now() - Duration::from_secs(5),
            None,
            Duration::ZERO,
        );
        let journal = Journal {
            path: dir.join("session.json"),
            snapshot: Arc::new(Mutex::new(snapshot)),
            sink: Arc::new(|_| {}),
            sequence: Mutex::new(0),
            control: ctl,
        };
        let segment = Segment {
            id: "real-segment".into(),
            start: 1.0,
            end: 2.0,
            text: "Evidence survives".into(),
            channel: Channel::System,
            r#final: true,
            speaker: None,
        };
        journal.publish(
            "interim",
            Some(Channel::System),
            None,
            Some(Segment {
                text: "Unsaved provisional words".into(),
                r#final: false,
                ..segment.clone()
            }),
        );
        assert!(journal.snapshot.lock().unwrap().segments.is_empty());
        assert!(!journal.path.exists());
        journal.emit("segment", None, Some(segment.clone()));
        journal.emit("segment", None, Some(segment));
        let recovered = recover(&base);
        assert_eq!(recovered[0].segments.len(), 1);
        assert!(!fs::read_to_string(&journal.path)
            .unwrap()
            .contains("Unsaved provisional"));
        assert_eq!(recovered[0].segments[0].channel, Channel::System);
        assert_eq!(recovered[0].status, "interrupted");
        cleanup(&base);
    }
    #[test]
    fn backlog_is_bounded_and_explicit() {
        let (tx, _rx) = mpsc::sync_channel(1);
        let mut track = Track {
            epoch: 0,
            normal: Normalizer::new(16000).unwrap(),
            samples: vec![0.1; 16000],
            start: 0.0,
            batch: 0,
            rate: 16000,
            writer: None,
            written: 0,
            quiet: 0,
            frame_end: None,
        };
        let ctl = Control::new();
        track
            .dispatch(Channel::Microphone, &Some(tx.clone()), &ctl, false)
            .unwrap();
        track.samples = vec![0.1; 16000];
        assert!(track
            .dispatch(Channel::Microphone, &Some(tx), &ctl, false)
            .unwrap_err()
            .contains("backlog"));
    }
    #[test]
    fn corrupt_and_mismatched_session_files_are_skipped() {
        let base = temporary();
        let dir = base.join("sessions").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("session.json"), b"broken").unwrap();
        assert!(recover(&base).is_empty());
        fs::write(
            dir.join("session.json"),
            serde_json::to_vec(&snapshot()).unwrap(),
        )
        .unwrap();
        assert!(recover(&base).is_empty());
        cleanup(&base);
    }
}
