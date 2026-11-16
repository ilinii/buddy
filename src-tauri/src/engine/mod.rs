use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Manager, State};
mod asr;
#[cfg(any(target_os = "macos", test, feature = "check-macos-bridge"))]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod audio_pcm;
mod capture;
pub mod deepgram;
mod dsp;
pub mod groq;
#[cfg(any(target_os = "ios", feature = "check-ios-bridge"))]
#[cfg_attr(not(target_os = "ios"), allow(dead_code))]
pub(crate) mod ios;
#[cfg(any(target_os = "macos", feature = "check-macos-bridge"))]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod macos;
mod models;
pub mod notes;
pub mod permissions;
mod runtime;
mod types;
use types::*;
#[derive(Default)]
pub struct EngineState {
    session: Mutex<Option<runtime::Session>>,
    operation: tokio::sync::Mutex<()>,
    cancelled_preparations: Mutex<std::collections::VecDeque<String>>,
    install_cancel: Mutex<Option<(String, Option<String>, Arc<AtomicBool>)>>,
}
impl EngineState {
    fn busy_for_exit(&self) -> bool {
        self.operation.try_lock().is_err()
            || active(self).is_some()
            || self.install_cancel.lock().unwrap().is_some()
    }
    fn begin_preparation(&self, model: String, request_id: String) -> Arc<AtomicBool> {
        let mut pending = self.cancelled_preparations.lock().unwrap();
        let cancel = Arc::new(AtomicBool::new(pending.contains(&request_id)));
        pending.retain(|id| id != &request_id);
        *self.install_cancel.lock().unwrap() = Some((model, Some(request_id), cancel.clone()));
        cancel
    }
    fn cancel_preparation(&self, request_id: String) {
        let mut pending = self.cancelled_preparations.lock().unwrap();
        if let Some((_, Some(id), cancel)) = self.install_cancel.lock().unwrap().as_ref() {
            if id == &request_id {
                cancel.store(true, Ordering::Release);
                return;
            }
        }
        if !pending.contains(&request_id) {
            pending.push_back(request_id);
            while pending.len() > 64 {
                pending.pop_front();
            }
        }
    }
}
fn active(state: &EngineState) -> Option<runtime::Session> {
    state
        .session
        .lock()
        .unwrap()
        .as_ref()
        .filter(|s| !s.done.load(Ordering::Acquire))
        .cloned()
}
#[tauri::command]
pub async fn engine_capabilities(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    model: String,
) -> Result<Capabilities, String> {
    let base = models::root(&app)?;
    let info = models::model(&model)?;
    let path = models::model_path(&base, &model)?;
    let devices = tokio::task::spawn_blocking(capture::devices)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Capabilities {
        installing_model: state
            .install_cancel
            .lock()
            .unwrap()
            .as_ref()
            .map(|(id, _, _)| id.clone()),
        native: true,
        microphone: cfg!(target_os = "ios") || !devices.is_empty(),
        system_audio: capture::system_supported(),
        platform: std::env::consts::OS.into(),
        audio_permissions: capture::permissions(),
        excludes_own_audio: cfg!(target_os = "macos"),
        devices,
        model_bundled: models::bundled_path(&app, &model)
            .ok()
            .and_then(|p| std::fs::metadata(p).ok())
            .is_some_and(|m| m.len() == info.bytes),
        model_ready: std::fs::metadata(path).is_ok_and(|m| m.len() == info.bytes),
        active: active(&state).map(|s| s.snapshot.lock().unwrap().clone()),
    })
}
#[tauri::command]
pub fn engine_models(app: tauri::AppHandle) -> Result<Vec<models::ModelInfo>, String> {
    let base = models::root(&app)?;
    Ok(models::catalog()
        .into_iter()
        .map(|mut m| {
            m.bundled = models::bundled_path(&app, &m.id)
                .ok()
                .and_then(|p| std::fs::metadata(p).ok())
                .is_some_and(|v| v.len() == m.bytes);
            m.installed = models::model_path(&base, &m.id)
                .ok()
                .and_then(|p| std::fs::metadata(p).ok())
                .is_some_and(|v| v.len() == m.bytes);
            m
        })
        .collect())
}
#[tauri::command]
pub async fn engine_install_model(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    model: String,
) -> Result<(), String> {
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another engine operation is running")?;
    if active(&state).is_some() {
        return Err("Finish recording before installing a speech model".into());
    }
    let base = models::root(&app)?;
    models::model(&model)?;
    let cancel = Arc::new(AtomicBool::new(false));
    *state.install_cancel.lock().unwrap() = Some((model.clone(), None, cancel.clone()));
    let result = models::install(app.clone(), base, model, cancel).await;
    *state.install_cancel.lock().unwrap() = None;
    result
}
#[tauri::command]
pub fn engine_cancel_install(state: State<'_, EngineState>) {
    if let Some((_, _, cancel)) = state.install_cancel.lock().unwrap().as_ref() {
        cancel.store(true, Ordering::Release);
    }
}
#[tauri::command]
pub async fn engine_prepare_model(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    model: String,
    request_id: String,
) -> Result<(), String> {
    uuid::Uuid::parse_str(&request_id).map_err(|_| "Invalid preparation request")?;
    let _guard = state.operation.try_lock().map_err(|_| {
        "Buddy is already preparing or processing audio. Wait or cancel that operation."
    })?;
    if active(&state).is_some() {
        return Err("Finish the active recording first".into());
    }
    let base = models::root(&app)?;
    models::model(&model)?;
    let bundled = models::bundled_path(&app, &model).ok();
    let cancel = state.begin_preparation(model.clone(), request_id.clone());
    let progress_app = app.clone();
    let progress: models::Progress = Arc::new(move |mut value| {
        use tauri::Emitter;
        value["requestId"] = serde_json::json!(request_id);
        let _ = progress_app.emit("engine-model-progress", value);
    });
    let result = models::prepare(base, model, bundled, cancel, progress).await;
    *state.install_cancel.lock().unwrap() = None;
    result
}
#[tauri::command]
pub fn engine_cancel_preparation(state: State<'_, EngineState>, request_id: String) {
    if uuid::Uuid::parse_str(&request_id).is_ok() {
        state.cancel_preparation(request_id);
    }
}
#[tauri::command]
pub async fn engine_start(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    request: StartRequest,
) -> Result<SessionSnapshot, String> {
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another engine operation is running")?;
    request.validate()?;
    capture::validate_permissions(request.microphone, request.system_audio)?;
    if active(&state).is_some() {
        return Err("A recording is already active or finishing".into());
    }
    let base = models::root(&app)?;
    let speech = if request.transcribe && request.speech_provider == SpeechProvider::Deepgram {
        Some(runtime::SpeechConfig::Deepgram(deepgram::read_key()?))
    } else if request.transcribe && request.speech_provider == SpeechProvider::Groq {
        Some(runtime::SpeechConfig::Groq(groq::read_key()?))
    } else if request.transcribe {
        let path = models::model_path(&base, &request.model)?;
        let info = models::model(&request.model)?;
        let verify = path.clone();
        tokio::task::spawn_blocking(move || models::verify(&verify, &info))
            .await
            .map_err(|e| e.to_string())??;
        Some(runtime::SpeechConfig::Local(path))
    } else {
        None
    };
    let session = runtime::start(request, base, speech, runtime::event_sink(app.clone()))?;
    *state.session.lock().unwrap() = Some(session.clone());
    for _ in 0..450 {
        let snapshot = session.snapshot.lock().unwrap().clone();
        if snapshot.status == "live" {
            return Ok(snapshot);
        }
        if session.done.load(Ordering::Acquire) {
            return Err(snapshot
                .warnings
                .last()
                .cloned()
                .unwrap_or("Recording could not start".into()));
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    session.control.cancel.store(true, Ordering::Release);
    session.control.stop();
    Err("Audio startup timed out. The engine is releasing its resources; retry after it has finished.".into())
}
#[tauri::command]
pub fn engine_pause(
    state: State<'_, EngineState>,
    session_id: String,
    paused: bool,
) -> Result<(), String> {
    let session = active(&state).ok_or("No active recording")?;
    if session.snapshot.lock().unwrap().session_id != session_id {
        return Err("Recording session changed".into());
    }
    if session.control.stopped() {
        return Err("Recording is already finishing".into());
    }
    session.control.set_pause(paused);
    Ok(())
}
#[tauri::command]
pub async fn engine_stop(
    state: State<'_, EngineState>,
    session_id: String,
    cancel_transcription: bool,
) -> Result<SessionSnapshot, String> {
    let session = state
        .session
        .lock()
        .unwrap()
        .clone()
        .ok_or("No recording session")?;
    if session.snapshot.lock().unwrap().session_id != session_id {
        return Err("Recording session changed".into());
    }
    if cancel_transcription {
        session.control.cancel.store(true, Ordering::Release);
        session
            .control
            .fail("Remaining transcription cancelled by the user");
    }
    session.control.stop();
    for _ in 0..1800 {
        if session.done.load(Ordering::Acquire) {
            return Ok(session.snapshot.lock().unwrap().clone());
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Err("Audio capture stopped. Transcription is still finishing; keep Buddy open or cancel the remaining transcription.".into())
}
#[tauri::command]
pub fn engine_status(state: State<'_, EngineState>) -> Option<SessionSnapshot> {
    state
        .session
        .lock()
        .unwrap()
        .as_ref()
        .map(|s| s.snapshot.lock().unwrap().clone())
}
#[tauri::command]
pub fn engine_recover(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<Vec<SessionSnapshot>, String> {
    let current = active(&state).map(|s| s.snapshot.lock().unwrap().session_id.clone());
    Ok(runtime::recover(&models::root(&app)?)
        .into_iter()
        .filter(|s| Some(&s.session_id) != current.as_ref())
        .collect())
}
#[tauri::command]
pub fn engine_delete_meeting(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    meeting_id: String,
) -> Result<(), String> {
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another engine operation is running")?;
    uuid::Uuid::parse_str(&meeting_id).map_err(|_| "Invalid meeting ID")?;
    if active(&state).is_some_and(|s| s.snapshot.lock().unwrap().meeting_id == meeting_id) {
        return Err("Finish recording before deleting this meeting".into());
    }
    let base = models::root(&app)?;
    for path in runtime::session_paths(&base) {
        if runtime::read_session(&path).is_some_and(|s| s.meeting_id == meeting_id) {
            std::fs::remove_dir_all(path.parent().ok_or("Invalid session path")?)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn engine_clear_history(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<(), String> {
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| "Another engine operation is running")?;
    if active(&state).is_some() {
        return Err("Finish recording before deleting session history".into());
    }
    let sessions = models::root(&app)?.join("sessions");
    if sessions.exists() {
        std::fs::remove_dir_all(sessions).map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn shutdown(app: &tauri::AppHandle) {
    if let Some((_, _, cancel)) = app
        .state::<EngineState>()
        .install_cancel
        .lock()
        .unwrap()
        .as_ref()
    {
        cancel.store(true, Ordering::Release);
    }
    if let Some(session) = active(&app.state::<EngineState>()) {
        session.control.cancel.store(true, Ordering::Release);
        session.control.stop();
    }
}
pub fn protect_exit(app: &tauri::AppHandle) -> bool {
    if !app.state::<EngineState>().busy_for_exit() {
        return false;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    use tauri::Emitter;
    let _ = app.emit("recording-exit-blocked", ());
    true
}

#[cfg(test)]
mod preparation_tests {
    use super::*;
    #[test]
    fn quit_guard_covers_startup_and_preparation_before_a_session_is_published() {
        let state = EngineState::default();
        assert!(!state.busy_for_exit());
        let operation = state.operation.try_lock().unwrap();
        assert!(state.busy_for_exit());
        drop(operation);
        state.begin_preparation("whisper-base".into(), uuid::Uuid::new_v4().to_string());
        assert!(state.busy_for_exit());
        state.install_cancel.lock().unwrap().take();
        assert!(!state.busy_for_exit());
    }
    #[test]
    fn early_cancel_is_honored_before_worker_registration() {
        let state = EngineState::default();
        let id = uuid::Uuid::new_v4().to_string();
        state.cancel_preparation(id.clone());
        let flag = state.begin_preparation("whisper-base".into(), id);
        assert!(flag.load(Ordering::Acquire));
    }
    #[test]
    fn stale_cancel_does_not_cancel_a_new_recording_request() {
        let state = EngineState::default();
        let old = uuid::Uuid::new_v4().to_string();
        let new = uuid::Uuid::new_v4().to_string();
        let flag = state.begin_preparation("whisper-base".into(), new.clone());
        state.cancel_preparation(old);
        assert!(!flag.load(Ordering::Acquire));
        state.cancel_preparation(new);
        assert!(flag.load(Ordering::Acquire));
    }
    #[test]
    fn abandoned_cancel_requests_remain_bounded() {
        let state = EngineState::default();
        for _ in 0..100 {
            state.cancel_preparation(uuid::Uuid::new_v4().to_string());
        }
        assert_eq!(state.cancelled_preparations.lock().unwrap().len(), 64);
    }
}
