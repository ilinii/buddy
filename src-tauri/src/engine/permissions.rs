use super::types::{Channel, PermissionState};

#[tauri::command]
pub async fn engine_request_audio_permission(
    app: tauri::AppHandle,
    source: Channel,
) -> Result<PermissionState, String> {
    #[cfg(target_os = "ios")]
    {
        let rx = super::ios::request(&app, source)?;
        tokio::time::timeout(std::time::Duration::from_secs(120), rx)
            .await
            .map_err(|_| "Permission request timed out. Check Settings → Buddy → Microphone.")?
            .map_err(|_| "iOS did not return a permission result".into())
    }
    #[cfg(any(target_os = "macos", feature = "check-macos-bridge"))]
    {
        let rx = super::macos::request(&app, source)?;
        tokio::time::timeout(std::time::Duration::from_secs(120),rx).await
            .map_err(|_|"Permission request timed out. Check macOS Privacy & Security and refresh permissions.")?
            .map_err(|_|"macOS did not return a permission result".into())
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos", feature = "check-macos-bridge")))]
    {
        let _ = (app, source);
        Err("This permission control is available on macOS only".into())
    }
}
#[tauri::command]
pub fn engine_open_audio_settings(source: Channel) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        let _ = source;
        super::ios::open_settings()
    }
    #[cfg(any(target_os = "macos", feature = "check-macos-bridge"))]
    {
        let destination = match source {
            Channel::Microphone => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            }
            Channel::System => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
        };
        let result = std::process::Command::new("/usr/bin/open")
            .arg(destination)
            .status()
            .map_err(|_| "Could not open macOS audio privacy settings")?;
        if result.success() {
            Ok(())
        } else {
            Err("Open System Settings → Privacy & Security manually".into())
        }
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos", feature = "check-macos-bridge")))]
    {
        let _ = source;
        Err("Open the device's audio privacy settings manually".into())
    }
}
