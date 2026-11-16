/// Opens only the platform's fixed settings page, never a caller-provided URL or command.
/// This does not toggle Do Not Disturb or claim other apps are silenced.
#[tauri::command]
pub fn open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe")
            .arg("ms-settings:notifications")
            .creation_flags(0x08000000)
            .status()
            .map_err(|e| format!("Could not open Windows notification settings: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .args(["-b", "com.apple.systempreferences"])
            .status()
            .map_err(|e| format!("Could not open System Settings: {e}"))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    Err("Open your device's Do Not Disturb settings manually.".into())
}
