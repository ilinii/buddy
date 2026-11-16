use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Microphone,
    System,
}
impl Channel {
    pub fn label(self) -> &'static str {
        match self {
            Self::Microphone => "microphone",
            Self::System => "system",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub id: String,
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub channel: Channel,
    pub r#final: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
    pub meeting_id: String,
    pub language: String,
    pub model: String,
    pub microphone: bool,
    pub system_audio: bool,
    pub device_id: Option<String>,
    pub retain_audio: bool,
    pub transcribe: bool,
    #[serde(default)]
    pub speech_provider: SpeechProvider,
    #[serde(default)]
    pub cloud_audio_consent: bool,
}
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SpeechProvider {
    #[default]
    Local,
    Groq,
    Deepgram,
}
impl StartRequest {
    pub fn validate(&self) -> Result<(), String> {
        if uuid::Uuid::parse_str(&self.meeting_id).is_err() {
            return Err("Invalid meeting ID".into());
        }
        if !["en", "fr"].contains(&self.language.as_str()) {
            return Err("Choose English or French".into());
        }
        if self.transcribe
            && self.speech_provider != SpeechProvider::Local
            && !self.cloud_audio_consent
        {
            return Err("Allow sending recording audio to the selected cloud speech provider before recording".into());
        }
        if !self.microphone && !self.system_audio {
            return Err("Select an audio source".into());
        }
        if self.device_id.as_ref().is_some_and(|v| v.len() > 512) {
            return Err("Invalid device identifier".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineEvent {
    pub session_id: String,
    pub meeting_id: String,
    pub sequence: u64,
    pub kind: String,
    pub status: String,
    pub duration: f64,
    pub level: f32,
    pub message: Option<String>,
    pub segment: Option<Segment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<Channel>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub sequence: u64,
    pub model: Option<String>,
    pub language: Option<String>,
    #[serde(default)]
    pub sources: Vec<Channel>,
    pub session_id: String,
    pub meeting_id: String,
    pub started_at: u64,
    pub status: String,
    pub duration: f64,
    pub segments: Vec<Segment>,
    pub retained_audio: bool,
    pub transcribing: bool,
    pub warnings: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub platform: String,
    pub audio_permissions: Option<AudioPermissions>,
    pub excludes_own_audio: bool,
    pub model_bundled: bool,
    pub installing_model: Option<String>,
    pub native: bool,
    pub microphone: bool,
    pub system_audio: bool,
    pub devices: Vec<Device>,
    pub model_ready: bool,
    pub active: Option<SessionSnapshot>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionState {
    NotDetermined,
    Granted,
    Denied,
    Restricted,
    Required,
}
#[derive(Debug, Clone, Serialize)]
pub struct AudioPermissions {
    pub microphone: PermissionState,
    pub system: PermissionState,
}

fn schema_version() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cloud_transcription_requires_separate_audio_consent() {
        let mut request: StartRequest = serde_json::from_value(serde_json::json!({"meetingId":uuid::Uuid::new_v4().to_string(),"language":"fr","model":"whisper-base","microphone":true,"systemAudio":false,"retainAudio":false,"transcribe":true})).unwrap();
        assert_eq!(request.speech_provider, SpeechProvider::Local);
        assert!(request.validate().is_ok());
        request.speech_provider = SpeechProvider::Groq;
        assert!(request.validate().unwrap_err().contains("cloud"));
        request.cloud_audio_consent = true;
        assert!(request.validate().is_ok());
        request.cloud_audio_consent = false;
        request.transcribe = false;
        assert!(request.validate().is_ok());
    }
}
