//! Fixed Groq transcription endpoint. Audio/credentials never cross back into JS.
use super::{
    asr::SpeechBackend,
    dsp::{rms, RATE},
    types::{Channel, Segment},
};
use serde::Deserialize;
use std::{
    io::Cursor,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

pub const MODEL: &str = "whisper-large-v3-turbo";
const ENDPOINT: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_RESPONSE: usize = 512 * 1024;

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.buddy.meeting", "groq-api-key")
        .map_err(|_| "OS credential store is unavailable".into())
}
#[tauri::command]
pub fn set_groq_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if !key.starts_with("gsk_")
        || !(20..=512).contains(&key.len())
        || !key.bytes().all(|v| v.is_ascii_alphanumeric() || v == b'_')
    {
        return Err("Groq API key format is invalid".into());
    }
    credential()?
        .set_password(key)
        .map_err(|_| "Could not save the Groq key in the OS credential store".into())
}
pub fn read_key() -> Result<String, String> {
    credential()?
        .get_password()
        .map_err(|_| "Add a Groq API key in Audio settings before recording with Groq".into())
}
#[tauri::command]
pub fn has_groq_key() -> Result<bool, String> {
    match credential()?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("Could not read the OS credential store".into()),
    }
}
#[tauri::command]
pub fn delete_groq_key() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the Groq API key".into()),
    }
}

pub struct GroqBackend {
    client: reqwest::Client,
    runtime: tokio::runtime::Runtime,
    key: String,
    language: String,
    cancel: Arc<AtomicBool>,
    endpoint: String,
}
impl GroqBackend {
    pub fn new(key: String, language: String, cancel: Arc<AtomicBool>) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(35))
            .build()
            .map_err(|_| "Could not create Groq client")?;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|_| "Could not start cloud transcription worker")?;
        Ok(Self {
            client,
            runtime,
            key,
            language,
            cancel,
            endpoint: ENDPOINT.into(),
        })
    }
    async fn upload(&self, body: Vec<u8>, content_type: &str) -> Result<Vec<u8>, String> {
        for attempt in 0..3 {
            let mut response = self.client.post(&self.endpoint).bearer_auth(&self.key)
                .header(reqwest::header::CONTENT_TYPE, content_type).body(body.clone()).send().await
                .map_err(|_| "Groq connection failed or timed out. Capture stopped; saved transcript passages remain available.")?;
            let status = response.status();
            if status.as_u16() == 401 || status.as_u16() == 403 {
                return Err("Groq rejected the API key. Check the key and project permissions in Audio settings.".into());
            }
            if status.as_u16() == 429 || status.is_server_error() {
                let delay = response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(1 << attempt);
                if attempt == 2 || delay > 5 {
                    return Err(if status.as_u16() == 429 { "Groq rate limit reached. Capture stopped; check your account limits before recording again." } else { "Groq is unavailable. Capture stopped; saved transcript passages remain available." }.into());
                }
                tokio::time::sleep(Duration::from_secs(delay.max(1))).await;
                continue;
            }
            if !status.is_success() {
                return Err(format!("Groq transcription rejected (HTTP {}). Saved transcript passages remain available.", status.as_u16()));
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| "Groq response was interrupted")?
            {
                if bytes.len() + chunk.len() > MAX_RESPONSE {
                    return Err("Groq response exceeded the transcript limit".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            return Ok(bytes);
        }
        Err("Groq retry limit reached".into())
    }
}
fn multipart(samples: &[f32], language: &str) -> Result<(Vec<u8>, String), String> {
    if samples.is_empty() || samples.len() > RATE * 30 || samples.iter().any(|s| !s.is_finite()) {
        return Err("Invalid cloud audio chunk".into());
    }
    let mut audio = Cursor::new(Vec::with_capacity(samples.len() * 2 + 44));
    {
        let mut writer = hound::WavWriter::new(
            &mut audio,
            hound::WavSpec {
                channels: 1,
                sample_rate: RATE as u32,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .map_err(|_| "Could not encode audio")?;
        for sample in samples {
            writer
                .write_sample((sample.clamp(-1., 1.) * i16::MAX as f32) as i16)
                .map_err(|_| "Could not encode audio")?;
        }
        writer.finalize().map_err(|_| "Could not finalize audio")?;
    }
    let boundary = format!("buddy-{}", uuid::Uuid::new_v4());
    let mut body = Vec::new();
    for (name, value) in [
        ("model", MODEL),
        ("language", language),
        ("response_format", "verbose_json"),
        ("timestamp_granularities[]", "segment"),
        ("temperature", "0"),
    ] {
        body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes());
    }
    body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\nContent-Type: audio/wav\r\n\r\n").as_bytes());
    body.extend_from_slice(&audio.into_inner());
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    Ok((body, format!("multipart/form-data; boundary={boundary}")))
}
#[derive(Deserialize)]
struct Response {
    text: String,
    segments: Vec<Passage>,
}
#[derive(Deserialize)]
struct Passage {
    start: f64,
    end: f64,
    text: String,
}
fn passages(
    bytes: &[u8],
    duration: f64,
    start: f64,
    channel: Channel,
    session: &str,
    batch: u64,
) -> Result<Vec<Segment>, String> {
    let response: Response =
        serde_json::from_slice(bytes).map_err(|_| "Groq returned an invalid transcript")?;
    if response.segments.len() > 256
        || response.text.len() > 32000
        || (!response.text.trim().is_empty() && response.segments.is_empty())
    {
        return Err("Groq returned missing or excessive timestamp evidence".into());
    }
    let mut result = Vec::new();
    let mut previous = 0.0;
    for (index, item) in response.segments.into_iter().enumerate() {
        if !item.start.is_finite()
            || !item.end.is_finite()
            || item.start < 0.
            || item.start < previous
            || item.end <= item.start
            || item.end > duration + 0.2
            || item.text.len() > 16000
        {
            return Err("Groq returned invalid transcript timestamps".into());
        }
        previous = item.start;
        if item.text.trim().is_empty() {
            continue;
        }
        let end = item.end.min(duration);
        if end <= item.start {
            return Err("Groq returned evidence outside the audio chunk".into());
        }
        result.push(Segment {
            id: format!("{session}-{}-{batch}-{index}", channel.label()),
            start: start + item.start,
            end: start + end,
            text: item.text.trim().into(),
            channel,
            r#final: true,
            speaker: None,
        });
    }
    Ok(result)
}
impl SpeechBackend for GroqBackend {
    fn transcribe(
        &self,
        samples: &[f32],
        start: f64,
        channel: Channel,
        session: &str,
        batch: u64,
    ) -> Result<Vec<Segment>, String> {
        if self.cancel.load(Ordering::Acquire) {
            return Err("Cloud transcription cancelled".into());
        }
        if samples.len() < RATE / 20 || rms(samples) < 0.002 {
            return Ok(Vec::new());
        }
        let (body, content_type) = multipart(samples, &self.language)?;
        let bytes = self.runtime.block_on(async {
            tokio::select! {
                result = self.upload(body, &content_type) => result,
                _ = async { loop { if self.cancel.load(Ordering::Acquire) { break; } tokio::time::sleep(Duration::from_millis(50)).await; } } => Err("Cloud transcription cancelled".into()),
            }
        })?;
        if self.cancel.load(Ordering::Acquire) {
            return Err("Cloud transcription cancelled".into());
        }
        passages(
            &bytes,
            samples.len() as f64 / RATE as f64,
            start,
            channel,
            session,
            batch,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
        time::Instant,
    };
    fn server(
        responses: Vec<(u16, &'static str)>,
        delay: Duration,
    ) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/transcriptions", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = Vec::new();
                loop {
                    let mut buf = [0u8; 8192];
                    let read = stream.read(&mut buf).unwrap();
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&buf[..read]);
                    if let Some(end) = request.windows(4).position(|v| v == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
                        let len = headers
                            .lines()
                            .find_map(|line| line.strip_prefix("content-length: "))
                            .unwrap()
                            .parse::<usize>()
                            .unwrap();
                        if request.len() >= end + 4 + len {
                            break;
                        }
                    }
                }
                let request = String::from_utf8_lossy(&request);
                assert!(request.contains("Bearer test-only-key"));
                assert!(request.contains(MODEL));
                assert!(request.contains("RIFF"));
                assert!(!request.contains("session-secret-name"));
                thread::sleep(delay);
                let header = format!("HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                let _ = stream.write_all(header.as_bytes());
            }
        });
        (url, handle)
    }
    fn backend(endpoint: String, cancel: Arc<AtomicBool>) -> GroqBackend {
        let mut backend = GroqBackend::new("test-only-key".into(), "fr".into(), cancel).unwrap();
        // Only tests permit a loopback transport; production always uses fixed HTTPS.
        backend.client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        backend.endpoint = endpoint;
        backend
    }
    #[test]
    fn http_upload_retries_rate_limit_and_validates_evidence() {
        let (endpoint, handle) = server(
            vec![
                (429, "{}"),
                (
                    200,
                    r#"{"text":"Bonjour","segments":[{"start":0.1,"end":0.9,"text":"Bonjour"}]}"#,
                ),
            ],
            Duration::ZERO,
        );
        let backend = backend(endpoint, Arc::new(AtomicBool::new(false)));
        let result = backend
            .transcribe(
                &vec![0.1; RATE],
                7.,
                Channel::Microphone,
                "session-secret-name",
                2,
            )
            .unwrap();
        assert_eq!(result[0].start, 7.1);
        assert_eq!(result[0].end, 7.9);
        handle.join().unwrap();
    }
    #[test]
    fn authentication_errors_never_expose_provider_body_or_key() {
        let (endpoint, handle) = server(
            vec![(401, r#"{"error":"test-only-key private transcript"}"#)],
            Duration::ZERO,
        );
        let backend = backend(endpoint, Arc::new(AtomicBool::new(false)));
        let error = backend
            .transcribe(&vec![0.1; RATE], 0., Channel::System, "session", 0)
            .unwrap_err();
        assert!(error.contains("rejected the API key"));
        assert!(!error.contains("test-only-key"));
        assert!(!error.contains("private transcript"));
        handle.join().unwrap();
    }
    #[test]
    fn cancellation_aborts_inflight_upload_and_silence_needs_no_network() {
        let (endpoint, handle) = server(vec![(200, "{}")], Duration::from_millis(400));
        let cancel = Arc::new(AtomicBool::new(false));
        let backend = backend(endpoint, cancel.clone());
        assert!(backend
            .transcribe(&vec![0.; RATE], 0., Channel::Microphone, "session", 0)
            .unwrap()
            .is_empty());
        let cancellation = thread::spawn(move || {
            thread::sleep(Duration::from_millis(100));
            cancel.store(true, Ordering::Release);
        });
        let start = Instant::now();
        let result = backend.transcribe(&vec![0.1; RATE], 0., Channel::Microphone, "session", 1);
        assert!(result.unwrap_err().contains("cancelled"));
        assert!(start.elapsed() < Duration::from_millis(350));
        cancellation.join().unwrap();
        handle.join().unwrap();
    }
    #[test]
    fn wav_request_has_fixed_model_and_no_meeting_metadata() {
        let (body, content_type) = multipart(&vec![0.1; RATE], "fr").unwrap();
        assert!(content_type.starts_with("multipart/form-data; boundary=buddy-"));
        let text = String::from_utf8_lossy(&body);
        assert!(text.contains(MODEL));
        assert!(text.contains("verbose_json"));
        assert!(text.contains("RIFF"));
        assert!(!text.contains("meetingId"));
        assert!(!text.contains("gsk_"));
        assert!(multipart(&[f32::NAN], "fr").is_err());
        assert!(multipart(&vec![0.1; RATE * 31], "en").is_err());
    }
    #[test]
    fn evidence_has_real_offsets_channel_and_stable_ids() {
        let bytes =
            br#"{"text":"Bonjour.","segments":[{"start":0.2,"end":1.5,"text":" Bonjour. "}]}"#;
        let a = passages(bytes, 2., 42., Channel::System, "session", 3).unwrap();
        let b = passages(bytes, 2., 42., Channel::System, "session", 3).unwrap();
        assert_eq!(a[0].id, b[0].id);
        assert_eq!(a[0].start, 42.2);
        assert_eq!(a[0].end, 43.5);
        assert_eq!(a[0].channel, Channel::System);
        assert_eq!(a[0].text, "Bonjour.");
        for invalid in [
            r#"{}"#,
            r#"{"text":"No evidence"}"#,
            r#"{"text":"outside","segments":[{"start":0,"end":50,"text":"outside"}]}"#,
            r#"{"text":"negative","segments":[{"start":-1,"end":1,"text":"negative"}]}"#,
        ] {
            assert!(passages(
                invalid.as_bytes(),
                2.,
                0.,
                Channel::Microphone,
                "session",
                0
            )
            .is_err());
        }
    }
}
