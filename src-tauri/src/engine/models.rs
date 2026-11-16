use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{Emitter, Manager};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub bundled: bool,
}
pub fn catalog() -> Vec<ModelInfo> {
    serde_json::from_str(include_str!("../../model-catalog.json"))
        .expect("Invalid built-in speech catalog")
}
pub fn bundled_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    model(id)?;
    app.path()
        .resource_dir()
        .map(|root| root.join("models").join(format!("{id}.bin")))
        .map_err(|e| e.to_string())
}
pub fn model(id: &str) -> Result<ModelInfo, String> {
    catalog()
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| "Unknown speech model".into())
}
pub fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("engine"))
        .map_err(|e| e.to_string())
}
pub fn model_path(base: &Path, id: &str) -> Result<PathBuf, String> {
    model(id)?;
    Ok(base.join("models").join(format!("{id}.bin")))
}
pub fn verify(path: &Path, info: &ModelInfo) -> Result<(), String> {
    let mut file = std::fs::File::open(path)
        .map_err(|_| "Install the selected speech model in Settings → Audio first")?;
    if file.metadata().map_err(|e| e.to_string())?.len() != info.bytes {
        return Err("Model file size mismatch; reinstall the model".into());
    }
    let mut hash = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    if format!("{:x}", hash.finalize()) != info.sha256 {
        return Err("Model checksum mismatch; reinstall the model".into());
    }
    Ok(())
}
pub async fn install(
    app: tauri::AppHandle,
    base: PathBuf,
    id: String,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let bundled = bundled_path(&app, &id).ok();
    prepare(
        base,
        id,
        bundled,
        cancel,
        Arc::new(move |payload| {
            let _ = app.emit("engine-model-progress", payload);
        }),
    )
    .await
}
pub(super) type Progress = Arc<dyn Fn(serde_json::Value) + Send + Sync>;
pub(super) async fn install_with_progress(
    base: PathBuf,
    id: String,
    cancel: Arc<AtomicBool>,
    progress: Progress,
) -> Result<(), String> {
    let info = model(&id)?;
    progress(serde_json::json!({"id":id,"stage":"checking","received":0,"total":info.bytes}));
    if cancel.load(Ordering::Acquire) {
        return Err("Model installation cancelled".into());
    }
    let final_path = model_path(&base, &id)?;
    std::fs::create_dir_all(final_path.parent().unwrap()).map_err(|e| e.to_string())?;
    if verify(&final_path, &info).is_ok() {
        return Ok(());
    }
    let partial = final_path.with_extension("partial");
    if std::fs::metadata(&partial).is_ok_and(|m| m.len() == info.bytes) {
        if verify(&partial, &info).is_ok() {
            if final_path.exists() {
                std::fs::remove_file(&final_path).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&partial, &final_path).map_err(|e| e.to_string())?;
            return Ok(());
        }
        std::fs::remove_file(&partial).map_err(|e| e.to_string())?;
    }
    let file_name = if id == "whisper-base" {
        "ggml-base.bin"
    } else {
        "ggml-small.bin"
    };
    let url=format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/{file_name}");
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .read_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(1200))
        .build()
        .map_err(|e| e.to_string())?;
    let offset = std::fs::metadata(&partial)
        .map(|m| m.len())
        .unwrap_or(0)
        .min(info.bytes);
    let mut request = client.get(url);
    if offset > 0 {
        request = request.header("Range", format!("bytes={offset}-"));
    }
    let mut response = request.send().await.map_err(|e| e.to_string())?;
    let resumed = offset > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if resumed
        && !response
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with(&format!("bytes {offset}-")))
    {
        return Err("Model server returned an invalid resume range".into());
    }
    progress(
        serde_json::json!({"id":id,"received":if resumed{offset}else{0},"total":info.bytes,"resumed":resumed,"stage":"downloading"}),
    );
    if !response.status().is_success() {
        return Err(format!(
            "Model download returned HTTP {}",
            response.status()
        ));
    }
    let mut written = if resumed { offset } else { 0 };
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed)
        .truncate(!resumed)
        .open(&partial)
        .map_err(|e| e.to_string())?;
    let mut last = std::time::Instant::now();
    while let Some(bytes) = response.chunk().await.map_err(|e| e.to_string())? {
        if cancel.load(Ordering::Acquire) {
            return Err("Model installation cancelled; its partial download can be resumed".into());
        }
        written += bytes.len() as u64;
        if written > info.bytes {
            return Err("Model download exceeded its pinned size".into());
        }
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        if last.elapsed().as_millis() > 300 {
            progress(
                serde_json::json!({"id":id,"received":written,"total":info.bytes,"stage":"downloading"}),
            );
            last = std::time::Instant::now();
        }
    }
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    progress(
        serde_json::json!({"id":id,"stage":"verifying","received":info.bytes,"total":info.bytes}),
    );
    let verify_info = info.clone();
    let verify_path = partial.clone();
    if let Err(error) = tokio::task::spawn_blocking(move || verify(&verify_path, &verify_info))
        .await
        .map_err(|e| e.to_string())?
    {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }
    if cancel.load(Ordering::Acquire) {
        return Err("Model installation cancelled".into());
    }
    if final_path.exists() {
        std::fs::remove_file(&final_path).map_err(|e| e.to_string())?;
    }
    std::fs::rename(partial, final_path).map_err(|e| e.to_string())?;
    progress(
        serde_json::json!({"id":id,"received":info.bytes,"total":info.bytes,"complete":true,"stage":"ready"}),
    );
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn models_are_allowlisted() {
        assert!(model("../../secret").is_err());
        assert_eq!(catalog().len(), 2);
    }
}
#[cfg(test)]
mod installer_tests {
    use super::*;
    #[test]
    #[ignore = "Downloads a pinned public model into ignored test output; needs network"]
    fn actual_model_installer() {
        let fixture = PathBuf::from(std::env::var("BUDDY_ASR_MODEL").expect("Set BUDDY_ASR_MODEL"));
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../output/engine-probe");
        std::fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let base = root.join(format!("installer-{}", uuid::Uuid::new_v4()));
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async{
  assert!(install_with_progress(base.clone(),"whisper-base".into(),Arc::new(AtomicBool::new(true)),Arc::new(|_|{})).await.is_err());assert!(!base.exists());
  std::fs::create_dir_all(base.join("models")).unwrap();let path=model_path(&base,"whisper-base").unwrap();let partial=path.with_extension("partial");let mut source=std::fs::File::open(fixture).unwrap().take(1024*1024);let mut prefix=std::fs::File::create(&partial).unwrap();std::io::copy(&mut source,&mut prefix).unwrap();drop(prefix);
  let events=Arc::new(std::sync::Mutex::new(Vec::new()));let output=events.clone();install_with_progress(base.clone(),"whisper-base".into(),Arc::new(AtomicBool::new(false)),Arc::new(move|event|output.lock().unwrap().push(event))).await.unwrap();verify(&path,&model("whisper-base").unwrap()).unwrap();assert!(!partial.exists());assert!(events.lock().unwrap().last().unwrap()["complete"].as_bool().unwrap());
  let resumed=events.lock().unwrap().iter().find_map(|e|e["resumed"].as_bool()).unwrap();std::fs::write(root.join("installer-result.json"),serde_json::to_vec_pretty(&serde_json::json!({"model":"whisper-base","resumed":resumed,"sha256Verified":true,"cancelBeforeRequest":true,"promotedAtomically":true})).unwrap()).unwrap();
  // A second install validates the existing file and does not need a fetch.
  install_with_progress(base.clone(),"whisper-base".into(),Arc::new(AtomicBool::new(false)),Arc::new(|_|{})).await.unwrap();
 });
        assert!(base.canonicalize().unwrap().starts_with(&root));
        std::fs::remove_dir_all(base).unwrap();
    }
}

/// Prefer a verified packaged model, then the resumable fixed-URL fallback.
pub(super) async fn prepare(
    base: PathBuf,
    id: String,
    bundled: Option<PathBuf>,
    cancel: Arc<AtomicBool>,
    progress: Progress,
) -> Result<(), String> {
    let info = model(&id)?;
    let destination = model_path(&base, &id)?;
    progress(serde_json::json!({"id":id,"stage":"checking","received":0,"total":info.bytes}));
    let cached = destination.clone();
    let known = info.clone();
    let ready = tokio::task::spawn_blocking(move || verify(&cached, &known).is_ok())
        .await
        .map_err(|e| e.to_string())?;
    if cancel.load(Ordering::Acquire) {
        return Err("Preparation cancelled. Nothing was recorded.".into());
    }
    if !ready {
        let copied = if let Some(source) = bundled {
            let output = destination.clone();
            let model = info.clone();
            let flag = cancel.clone();
            let report = progress.clone();
            tokio::task::spawn_blocking(move || {
                copy_bundled(&source, &output, &model, &flag, &report)
            })
            .await
            .map_err(|e| e.to_string())??
        } else {
            false
        };
        if !copied {
            install_with_progress(base, id.clone(), cancel.clone(), progress.clone()).await?;
        }
    }
    if cancel.load(Ordering::Acquire) {
        return Err("Preparation cancelled. Nothing was recorded.".into());
    }
    progress(
        serde_json::json!({"id":id,"stage":"ready","received":info.bytes,"total":info.bytes,"complete":true}),
    );
    Ok(())
}
fn copy_bundled(
    source: &Path,
    destination: &Path,
    info: &ModelInfo,
    cancel: &AtomicBool,
    progress: &Progress,
) -> Result<bool, String> {
    let mut input = match std::fs::File::open(source) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(format!("Cannot read the included speech engine: {error}")),
    };
    if input.metadata().map_err(|e| e.to_string())?.len() != info.bytes {
        return Ok(false);
    }
    std::fs::create_dir_all(destination.parent().ok_or("Invalid model location")?)
        .map_err(|e| e.to_string())?;
    let mut output = atomic_write_file::AtomicWriteFile::open(destination)
        .map_err(|e| format!("Not enough storage or access to prepare speech: {e}"))?;
    let mut buffer = [0u8; 65536];
    let mut received = 0u64;
    let mut hash = Sha256::new();
    let mut last = std::time::Instant::now();
    loop {
        if cancel.load(Ordering::Acquire) {
            return Err("Preparation cancelled. Nothing was recorded.".into());
        }
        let count = input.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        received += count as u64;
        if received > info.bytes {
            return Ok(false);
        }
        hash.update(&buffer[..count]);
        output
            .write_all(&buffer[..count])
            .map_err(|e| format!("Cannot save the speech engine: {e}"))?;
        if received == count as u64 || last.elapsed().as_millis() > 150 {
            progress(
                serde_json::json!({"id":info.id,"stage":"copying","received":received,"total":info.bytes}),
            );
            last = std::time::Instant::now();
        }
    }
    if received != info.bytes || format!("{:x}", hash.finalize()) != info.sha256 {
        return Ok(false);
    }
    if cancel.load(Ordering::Acquire) {
        return Err("Preparation cancelled. Nothing was recorded.".into());
    }
    output.commit().map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod bundle_tests {
    use super::*;
    fn base() -> PathBuf {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../output/engine-tests");
        std::fs::create_dir_all(&root).unwrap();
        let base = root
            .canonicalize()
            .unwrap()
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&base).unwrap();
        base
    }
    fn cleanup(base: &Path) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../output/engine-tests")
            .canonicalize()
            .unwrap();
        assert!(base.canonicalize().unwrap().starts_with(root));
        std::fs::remove_dir_all(base).unwrap();
    }
    fn info() -> ModelInfo {
        ModelInfo {
            id: "test".into(),
            name: "test".into(),
            bytes: 6,
            sha256: format!("{:x}", Sha256::digest(b"speech")),
            installed: false,
            bundled: true,
        }
    }
    #[test]
    fn bundled_copy_is_verified_and_keeps_old_cache_on_corruption() {
        let base = base();
        let source = base.join("source");
        let destination = base.join("model.bin");
        std::fs::write(&source, b"speech").unwrap();
        let sink: Progress = Arc::new(|_| {});
        assert!(copy_bundled(
            &source,
            &destination,
            &info(),
            &AtomicBool::new(false),
            &sink
        )
        .unwrap());
        assert_eq!(std::fs::read(&destination).unwrap(), b"speech");
        std::fs::write(&source, b"broken").unwrap();
        assert!(!copy_bundled(
            &source,
            &destination,
            &info(),
            &AtomicBool::new(false),
            &sink
        )
        .unwrap());
        assert_eq!(std::fs::read(&destination).unwrap(), b"speech");
        cleanup(&base);
    }
    #[test]
    fn cancelling_included_model_does_not_publish_partial_file() {
        let base = base();
        let source = base.join("source");
        let destination = base.join("model.bin");
        std::fs::write(&source, b"speech").unwrap();
        let sink: Progress = Arc::new(|_| {});
        assert!(copy_bundled(
            &source,
            &destination,
            &info(),
            &AtomicBool::new(true),
            &sink
        )
        .is_err());
        assert!(!destination.exists());
        cleanup(&base);
    }
    #[test]
    #[ignore = "Requires pinned BUDDY_ASR_MODEL; no network or microphone required"]
    fn actual_bundled_preparation() {
        let source = PathBuf::from(std::env::var("BUDDY_ASR_MODEL").expect("Set BUDDY_ASR_MODEL"));
        let base = base();
        let events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let data = events.clone();
        let progress: Progress = Arc::new(move |value| data.lock().unwrap().push(value));
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            prepare(
                base.clone(),
                "whisper-base".into(),
                Some(source),
                Arc::new(AtomicBool::new(false)),
                progress.clone(),
            )
            .await
            .unwrap();
            assert!(events
                .lock()
                .unwrap()
                .iter()
                .any(|v| v["stage"] == "copying"));
            assert!(!events
                .lock()
                .unwrap()
                .iter()
                .any(|v| v["stage"] == "downloading"));
            events.lock().unwrap().clear();
            prepare(
                base.clone(),
                "whisper-base".into(),
                None,
                Arc::new(AtomicBool::new(false)),
                progress,
            )
            .await
            .unwrap();
            assert!(!events
                .lock()
                .unwrap()
                .iter()
                .any(|v| v["stage"] == "downloading" || v["stage"] == "copying"));
        });
        verify(
            &model_path(&base, "whisper-base").unwrap(),
            &model("whisper-base").unwrap(),
        )
        .unwrap();
        cleanup(&base);
    }
}
