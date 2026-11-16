use std::{fs::File, io::Write, path::PathBuf, sync::Mutex};
use tauri::Manager;

#[derive(Default)]
pub struct WorkspaceLock(Mutex<Option<File>>);
fn claim_lock(path: &std::path::Path) -> Result<File, String> {
    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|_| "Could not open the workspace lock file")?;
    file.try_lock().map_err(|_|"This workspace is already open in another Buddy process, or its lock is unavailable. Close the other instance before retrying. Existing data was not changed.")?;
    Ok(file)
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let state = app.state::<WorkspaceLock>();
    let mut lock = state
        .0
        .lock()
        .map_err(|_| "Workspace lock state is unavailable")?;
    if lock.is_none() {
        *lock = Some(claim_lock(&dir.join("workspace.lock"))?);
    }
    Ok(dir.join("buddy.sqlite3"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exclusive_workspace_lock_is_released_by_os_handle_cleanup() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../output/engine-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("workspace.lock");
        let first = claim_lock(&path).unwrap();
        assert!(claim_lock(&path).is_err());
        drop(first);
        let second = claim_lock(&path).unwrap();
        drop(second);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}

#[tauri::command]
pub fn load_database(app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    let path = database_path(&app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > 50 * 1024 * 1024 {
        return Err(
            "Database exceeds the 50 MB snapshot limit. Existing data was not changed.".into(),
        );
    }
    std::fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_database(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.len() > 50 * 1024 * 1024 || !bytes.starts_with(b"SQLite format 3\0") {
        return Err("Invalid or oversized SQLite snapshot".into());
    }
    let path = database_path(&app)?;
    let mut file = atomic_write_file::AtomicWriteFile::open(path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.commit().map_err(|e| e.to_string())
}
