//! Narrow C ABI to Apple frameworks; no subprocess, screen frames or private APIs.
use super::{
    audio_pcm::{self, Plane},
    capture::{deliver_frame, Frame},
    runtime::Control,
    types::{AudioPermissions, Channel, PermissionState},
};
use std::{
    ffi::c_void,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
        Arc,
    },
    time::{Duration, Instant},
};

#[repr(C)]
struct NativePlane {
    data: *const u8,
    bytes: u32,
    channels: u32,
}
type AudioCallback = unsafe extern "C" fn(*mut c_void, *const NativePlane, u32, u32, u32, u32, f64);
type EventCallback = unsafe extern "C" fn(*mut c_void, i32);
extern "C" {
    fn buddy_macos_audio_supported() -> i32;
    fn buddy_macos_audio_permission(source: i32) -> i32;
    fn buddy_macos_request_audio_permission(
        source: i32,
        context: *mut c_void,
        callback: EventCallback,
    );
    fn buddy_macos_audio_create(
        context: *mut c_void,
        audio: AudioCallback,
        event: EventCallback,
    ) -> *mut c_void;
    fn buddy_macos_audio_destroy(handle: *mut c_void);
}
fn source(channel: Channel) -> i32 {
    if channel == Channel::Microphone {
        0
    } else {
        1
    }
}
fn state(value: i32) -> PermissionState {
    match value {
        1 => PermissionState::Granted,
        2 => PermissionState::Denied,
        3 => PermissionState::Restricted,
        4 => PermissionState::Required,
        _ => PermissionState::NotDetermined,
    }
}
pub fn supported() -> bool {
    unsafe { buddy_macos_audio_supported() == 1 }
}
pub fn permissions() -> AudioPermissions {
    unsafe {
        AudioPermissions {
            microphone: state(buddy_macos_audio_permission(0)),
            system: state(buddy_macos_audio_permission(1)),
        }
    }
}
pub fn validate(microphone: bool, system: bool) -> Result<(), String> {
    let p = permissions();
    if microphone && p.microphone != PermissionState::Granted {
        return Err("Allow microphone access in Buddy's recording setup before starting.".into());
    }
    if system && (!supported() || p.system != PermissionState::Granted) {
        return Err("Allow Screen & System Audio Recording for Buddy in macOS settings, then relaunch Buddy if macOS requests it.".into());
    }
    Ok(())
}
// Permissions are requested only by a user gesture, not capability checks/startup.
// The native callback owns this sender even if the UI stops waiting.
unsafe extern "C" fn permission_done(context: *mut c_void, value: i32) {
    let pending = Box::from_raw(context.cast::<PendingPermission>());
    permission_gate(pending.channel).store(false, Ordering::Release);
    let _ = pending.tx.send(state(value));
}
static MIC_PERMISSION_PENDING: AtomicBool = AtomicBool::new(false);
static SYSTEM_PERMISSION_PENDING: AtomicBool = AtomicBool::new(false);
fn permission_gate(channel: Channel) -> &'static AtomicBool {
    if channel == Channel::Microphone {
        &MIC_PERMISSION_PENDING
    } else {
        &SYSTEM_PERMISSION_PENDING
    }
}
struct PendingPermission {
    tx: tokio::sync::oneshot::Sender<PermissionState>,
    channel: Channel,
}
pub fn request(
    app: &tauri::AppHandle,
    channel: Channel,
) -> Result<tokio::sync::oneshot::Receiver<PermissionState>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    if permission_gate(channel).swap(true, Ordering::AcqRel) {
        return Err("A macOS permission request is already pending".into());
    }
    let scheduled = app.run_on_main_thread(move || unsafe {
        let context = Box::into_raw(Box::new(PendingPermission { tx, channel })).cast::<c_void>();
        buddy_macos_request_audio_permission(source(channel), context, permission_done);
    });
    if scheduled.is_err() {
        permission_gate(channel).store(false, Ordering::Release);
        return Err("Could not request macOS audio permission".into());
    }
    Ok(rx)
}

struct Context {
    tx: SyncSender<Frame>,
    ctl: Arc<Control>,
    events: SyncSender<i32>,
}
unsafe extern "C" fn audio(
    context: *mut c_void,
    planes: *const NativePlane,
    count: u32,
    frames: u32,
    channels: u32,
    rate: u32,
    age: f64,
) {
    // Native destroy is a serial callback barrier; context and plane memory remain
    // valid until this synchronous callback returns. No pointer escapes it.
    let ctx = &*context.cast::<Context>();
    if !ctx.ctl.capturing() || ctx.ctl.stopped() || ctx.ctl.paused() {
        return;
    }
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<(), &str> {
        if planes.is_null() || !(1..=8).contains(&count) {
            return Err("Invalid macOS audio planes");
        }
        let native = std::slice::from_raw_parts(planes, count as usize);
        if native
            .iter()
            .any(|p| p.data.is_null() || p.bytes > 192000 * 8 * 4)
        {
            return Err("Invalid macOS audio plane size");
        }
        let borrowed: Vec<_> = native
            .iter()
            .map(|p| Plane {
                bytes: std::slice::from_raw_parts(p.data, p.bytes as usize),
                channels: p.channels as usize,
            })
            .collect();
        let samples = audio_pcm::downmix(&borrowed, frames as usize, channels as usize, rate)?;
        let elapsed = ctx.ctl.elapsed();
        if age.is_finite() && age > elapsed + 0.02 {
            return Ok(());
        } // pre-start buffered audio
        let start = audio_pcm::capture_start(elapsed, age, frames as usize, rate)?;
        deliver_frame(&ctx.tx, &ctx.ctl, Channel::System, samples, rate, start);
        Ok(())
    }));
    match result {
        Ok(Ok(())) => {}
        Ok(Err(error)) => ctx.ctl.fail(error),
        Err(_) => ctx.ctl.fail("macOS audio callback failed safely"),
    }
}
unsafe extern "C" fn event(context: *mut c_void, code: i32) {
    let ctx = &*context.cast::<Context>();
    let _ = ctx.events.try_send(code);
}
fn error(code: i32) -> &'static str {
    match code {
    2=>"macOS computer-audio access failed. Check Screen & System Audio Recording permission.",
    3=>"macOS computer audio needs an available display. Reconnect it before recording.",
    4=>"ScreenCaptureKit could not start computer audio. Check permission, then retry.",
    5=>"macOS computer audio stopped or its route changed. Saved transcript passages remain available; start a new recording.",
    6=>"ScreenCaptureKit returned an unsupported audio format; capture stopped safely.",
    _=>"macOS computer audio could not start.",
}
}
struct NativeCapture {
    handle: *mut c_void,
    _context: Box<Context>,
}
impl Drop for NativeCapture {
    fn drop(&mut self) {
        unsafe {
            buddy_macos_audio_destroy(self.handle);
        }
    }
}
pub fn system(tx: SyncSender<Frame>, ctl: Arc<Control>, ready: SyncSender<Result<(), String>>) {
    let run = || -> Result<(), String> {
        validate(false, true)?;
        let (events, rx) = mpsc::sync_channel(8);
        let mut context = Box::new(Context {
            tx,
            ctl: ctl.clone(),
            events,
        });
        let handle = unsafe {
            buddy_macos_audio_create((&mut *context as *mut Context).cast(), audio, event)
        };
        if handle.is_null() {
            return Err("macOS computer audio is unavailable or a previous capture is still releasing. Wait before retrying.".into());
        }
        let _capture = NativeCapture {
            handle,
            _context: context,
        };
        let deadline = Instant::now() + Duration::from_secs(5);
        while !ctl.stopped() {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(1) => {
                    let _ = ready.send(Ok(()));
                    while !ctl.stopped() {
                        match rx.recv_timeout(Duration::from_millis(20)) {
                            Ok(code) if code != 1 => return Err(error(code).into()),
                            Err(mpsc::RecvTimeoutError::Disconnected) => {
                                return Err("macOS audio event channel closed".into())
                            }
                            _ => {}
                        }
                    }
                    return Ok(());
                }
                Ok(code) => return Err(error(code).into()),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("macOS audio startup channel closed".into())
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if Instant::now() > deadline {
                return Err("macOS computer audio startup timed out. Native teardown is running; retry after it finishes.".into());
            }
        }
        Ok(())
    };
    if let Err(error) = run() {
        let _ = ready.send(Err(error.clone()));
        ctl.fail(&error);
    }
}
#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    #[test]
    fn native_permission_probe_does_not_start_a_capture() {
        let p = permissions();
        assert!(supported());
        assert!(matches!(
            p.system,
            PermissionState::Granted | PermissionState::Required
        ));
    }
    #[test]
    fn invalid_bridge_input_is_rejected_without_opening_devices() {
        assert!(unsafe { buddy_macos_audio_create(std::ptr::null_mut(), audio, event) }.is_null());
    }
}
