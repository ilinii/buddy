use super::{
    dsp::{rms, RATE},
    types::{Channel, Segment},
};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
/// Backend boundary: adding another runtime must preserve real source IDs/times.
pub trait SpeechBackend: Send {
    fn transcribe(
        &self,
        samples: &[f32],
        start: f64,
        channel: Channel,
        session: &str,
        batch: u64,
    ) -> Result<Vec<Segment>, String>;
}
pub struct WhisperBackend {
    ctx: WhisperContext,
    language: String,
    cancel: Arc<AtomicBool>,
}
impl WhisperBackend {
    pub fn load(path: &Path, language: &str, cancel: Arc<AtomicBool>) -> Result<Self, String> {
        let mut parameters = WhisperContextParameters::default();
        parameters.use_gpu(false);
        let ctx = WhisperContext::new_with_params(
            path.to_str().ok_or("Invalid model location")?,
            parameters,
        )
        .map_err(|e| format!("Could not load local speech model: {e}"))?;
        Ok(Self {
            ctx,
            language: language.into(),
            cancel,
        })
    }
}
impl SpeechBackend for WhisperBackend {
    fn transcribe(
        &self,
        samples: &[f32],
        start: f64,
        channel: Channel,
        session: &str,
        batch: u64,
    ) -> Result<Vec<Segment>, String> {
        if samples.len() < RATE / 20 || rms(samples) < 0.002 {
            return Ok(Vec::new());
        }
        let mut state = self.ctx.create_state().map_err(|e| e.to_string())?;
        let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        p.set_language(Some(&self.language));
        p.set_translate(false);
        p.set_n_threads(
            std::thread::available_parallelism()
                .map(|n| n.get().saturating_sub(1).clamp(1, 6))
                .unwrap_or(2) as i32,
        );
        p.set_print_special(false);
        p.set_print_progress(false);
        p.set_print_realtime(false);
        p.set_print_timestamps(false);
        p.set_no_context(true);
        p.set_suppress_blank(true);
        p.set_suppress_nst(true);
        p.set_no_speech_thold(0.65);
        // whisper-rs 0.16.0's safe callback boxes a trait object but casts its
        // address to the original closure type. Use the raw callback with a
        // stable AtomicBool allocation instead (verified by the real ASR probe).
        unsafe extern "C" fn abort(user_data: *mut std::ffi::c_void) -> bool {
            if user_data.is_null() {
                return true;
            }
            // SAFETY: points to self.cancel, held alive throughout state.full.
            unsafe { &*user_data.cast::<AtomicBool>() }.load(Ordering::Acquire)
        }
        unsafe {
            p.set_abort_callback(Some(abort));
            p.set_abort_callback_user_data(Arc::as_ptr(&self.cancel) as *mut std::ffi::c_void);
        }

        let padded = if samples.len() < RATE {
            let mut audio = samples.to_vec();
            audio.resize(RATE, 0.0);
            Some(audio)
        } else {
            None
        };
        state
            .full(p, padded.as_deref().unwrap_or(samples))
            .map_err(|e| format!("Local transcription failed: {e}"))?;
        let duration = samples.len() as f64 / RATE as f64;
        let mut result = Vec::new();
        for (index, item) in state.as_iter().enumerate() {
            let text = item.to_string().trim().to_string();
            if text.is_empty() {
                continue;
            }
            let a = (item.start_timestamp() as f64 * 0.01).clamp(0.0, duration);
            let b = (item.end_timestamp() as f64 * 0.01).clamp(a, duration);
            if b <= a {
                continue;
            }
            result.push(Segment {
                id: format!("{session}-{}-{batch}-{index}", channel.label()),
                start: start + a,
                end: start + b,
                text,
                channel,
                r#final: true,
                speaker: None,
            });
        }
        Ok(result)
    }
}
#[cfg(test)]
mod integration_tests {
    use super::*;
    #[test]
    #[ignore = "Requires a pinned local model and the public JFK WAV fixture; no microphone is opened"]
    fn actual_whisper_fixture() {
        let model = std::env::var("BUDDY_ASR_MODEL").expect("Set BUDDY_ASR_MODEL");
        let wav = std::env::var("BUDDY_ASR_WAV").expect("Set BUDDY_ASR_WAV");
        let info = super::super::models::model("whisper-base").unwrap();
        super::super::models::verify(Path::new(&model), &info).unwrap();
        let mut reader = hound::WavReader::open(wav).unwrap();
        let spec = reader.spec();
        assert_eq!(spec.channels, 1);
        assert_eq!(spec.sample_rate, 16000);
        assert_eq!(spec.bits_per_sample, 16);
        let samples: Vec<f32> = reader
            .samples::<i16>()
            .map(|s| s.unwrap() as f32 / 32768.0)
            .collect();
        let cancel = Arc::new(AtomicBool::new(false));
        let start = std::time::Instant::now();
        let backend = WhisperBackend::load(Path::new(&model), "en", cancel.clone()).unwrap();
        assert!(backend
            .transcribe(&vec![0.0; RATE], 0.0, Channel::Microphone, "silence", 0)
            .unwrap()
            .is_empty());
        let segments = backend
            .transcribe(&samples, 42.0, Channel::System, "fixture", 0)
            .unwrap();
        let text = segments
            .iter()
            .map(|s| s.text.as_str())
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        assert!(
            text.contains("ask not what your country can do for you"),
            "{text}"
        );
        assert!(segments.iter().all(|s| s.r#final
            && s.start >= 42.0
            && s.end <= 42.0 + samples.len() as f64 / RATE as f64
            && s.end > s.start
            && s.channel == Channel::System));
        let result = serde_json::json!({"fixture":"whisper.cpp public JFK sample","model":"whisper-base","elapsedSeconds":start.elapsed().as_secs_f64(),"audioSeconds":samples.len() as f64/RATE as f64,"segments":segments,"physicalDeviceVerified":false});
        if let Ok(path) = std::env::var("BUDDY_ASR_RESULT") {
            std::fs::write(path, serde_json::to_vec_pretty(&result).unwrap()).unwrap();
        }
        println!("{result}");
        let during = cancel.clone();
        let signal = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(50));
            during.store(true, Ordering::Release);
        });
        let cancelled =
            backend.transcribe(&samples, 0.0, Channel::Microphone, "cancel-during-call", 0);
        signal.join().unwrap();
        assert!(cancelled.is_err());
        cancel.store(true, Ordering::Release);
        assert!(backend
            .transcribe(&samples, 0.0, Channel::Microphone, "cancelled", 0)
            .is_err());
    }
}
