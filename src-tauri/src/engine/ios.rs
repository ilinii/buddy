//! iPhone permission/session policy. PCM and ASR reuse the existing bounded engine.
use super::types::{AudioPermissions, Channel, PermissionState};
use std::{
    ffi::c_void,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::Manager;
type PermissionCallback = unsafe extern "C" fn(*mut c_void, i32);
extern "C" {
    fn buddy_ios_microphone_permission() -> i32;
    fn buddy_ios_request_microphone(context: *mut c_void, callback: PermissionCallback);
    fn buddy_ios_open_settings() -> i32;
    fn buddy_ios_audio_begin() -> *mut c_void;
    fn buddy_ios_audio_event(handle: *mut c_void) -> i32;
    fn buddy_ios_audio_end(handle: *mut c_void);
    fn buddy_ios_protect_storage(path: *const std::ffi::c_char) -> i32;
    fn buddy_ios_share(
        bytes: *const u8,
        count: usize,
        name: *const std::ffi::c_char,
        context: *mut c_void,
        callback: PermissionCallback,
    );
}
pub fn configure_storage(app: &tauri::AppHandle) -> Result<(), String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let native = std::ffi::CString::new(path.to_string_lossy().as_bytes())
        .map_err(|_| "Invalid sandbox path")?;
    if unsafe { buddy_ios_protect_storage(native.as_ptr()) } != 1 {
        return Err(
            "Could not protect the iPhone workspace and exclude it from device backups".into(),
        );
    }
    Ok(())
}
unsafe extern "C" fn share_done(context: *mut c_void, value: i32) {
    let tx = Box::from_raw(context.cast::<tokio::sync::oneshot::Sender<bool>>());
    let _ = tx.send(value == 1);
}
pub async fn share(bytes: Vec<u8>, name: String) -> Result<(), String> {
    if bytes.len() > 5 * 1024 * 1024
        || name.is_empty()
        || name.len() > 180
        || name.starts_with('.')
        || name.chars().any(|c| c.is_control() || "/\\:".contains(c))
    {
        return Err(
            "Choose a valid export name and a document smaller than 5 MB to share on iPhone."
                .into(),
        );
    }
    let filename = std::ffi::CString::new(name).map_err(|_| "Invalid export name")?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    unsafe {
        buddy_ios_share(
            bytes.as_ptr(),
            bytes.len(),
            filename.as_ptr(),
            Box::into_raw(Box::new(tx)).cast(),
            share_done,
        );
    }
    match tokio::time::timeout(std::time::Duration::from_secs(15), rx).await {
        Ok(Ok(true)) => Ok(()),
        _ => Err("Could not open the iPhone share sheet. Return to Buddy and try again.".into()),
    }
}
fn state(value: i32) -> PermissionState {
    match value {
        1 => PermissionState::Granted,
        2 => PermissionState::Denied,
        3 => PermissionState::Restricted,
        _ => PermissionState::NotDetermined,
    }
}
pub fn permissions() -> AudioPermissions {
    AudioPermissions {
        microphone: state(unsafe { buddy_ios_microphone_permission() }),
        system: PermissionState::Restricted,
    }
}
pub fn validate(microphone: bool, system: bool) -> Result<(), String> {
    if system {
        return Err("iPhone recording supports the microphone only. Audio from other apps cannot be captured.".into());
    }
    if microphone && permissions().microphone != PermissionState::Granted {
        return Err(
            "Allow Buddy to use the microphone in iPhone Settings before recording.".into(),
        );
    }
    Ok(())
}
static PERMISSION_PENDING: AtomicBool = AtomicBool::new(false);
unsafe extern "C" fn permission_done(context: *mut c_void, value: i32) {
    // Native completion owns the sender even if the webview's request times out.
    let tx = Box::from_raw(context.cast::<tokio::sync::oneshot::Sender<PermissionState>>());
    PERMISSION_PENDING.store(false, Ordering::Release);
    let _ = tx.send(state(value));
}
pub fn request(
    app: &tauri::AppHandle,
    source: Channel,
) -> Result<tokio::sync::oneshot::Receiver<PermissionState>, String> {
    if source != Channel::Microphone {
        return Err("iPhone supports microphone recording only".into());
    }
    if PERMISSION_PENDING.swap(true, Ordering::AcqRel) {
        return Err("A microphone permission request is already pending".into());
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    if app
        .run_on_main_thread(move || unsafe {
            buddy_ios_request_microphone(Box::into_raw(Box::new(tx)).cast(), permission_done);
        })
        .is_err()
    {
        PERMISSION_PENDING.store(false, Ordering::Release);
        return Err("Could not request iPhone microphone permission".into());
    }
    Ok(rx)
}
pub fn open_settings() -> Result<(), String> {
    if unsafe { buddy_ios_open_settings() } == 1 {
        Ok(())
    } else {
        Err("Open Settings → Buddy → Microphone on your iPhone.".into())
    }
}
pub struct AudioSession(*mut c_void);
impl AudioSession {
    pub fn begin() -> Result<Self, String> {
        let handle = unsafe { buddy_ios_audio_begin() };
        if handle.is_null() {
            Err("iPhone audio could not start. Check microphone permission and end any active call, then try again.".into())
        } else {
            Ok(Self(handle))
        }
    }
    pub fn issue(&self) -> Option<&'static str> {
        match unsafe { buddy_ios_audio_event(self.0) } {
            0 => None,
            1 => Some("iPhone interrupted the recording, for example for a call. Captured passages were finalized; start a new recording to continue."),
            2 => Some("The iPhone microphone route changed. Captured passages were finalized; check your headset and start a new recording."),
            _ => Some("iPhone audio services restarted. Captured passages were finalized; start a new recording to continue."),
        }
    }
}
impl Drop for AudioSession {
    fn drop(&mut self) {
        unsafe { buddy_ios_audio_end(self.0) };
    }
}
