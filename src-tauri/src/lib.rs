mod cancellation;
mod engine;
mod focus;
mod knowledge;
mod providers;
mod storage;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        // Never interpret another instance's arguments as tools, paths or URLs.
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .manage(providers::ProviderGate::default())
        .manage(knowledge::KnowledgeState::default())
        .manage(storage::WorkspaceLock::default())
        .manage(engine::EngineState::default())
        .manage(engine::notes::NotesState::default())
        .setup(|app| {
            #[cfg(target_os = "ios")]
            engine::ios::configure_storage(app.handle())?;
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                // Configure before showing, so Windows never flashes its accent caption.
                #[cfg(target_os = "windows")]
                window.set_decorations(false)?;
                if let Some(monitor) = window.current_monitor()? {
                    let work = monitor.work_area();
                    let scale = monitor.scale_factor();
                    let width = (work.size.width as f64 / scale - 48.0).max(320.0);
                    let height = (work.size.height as f64 / scale - 48.0).max(320.0);
                    window.set_min_size(Some(tauri::LogicalSize::new(
                        width.min(780.0),
                        height.min(560.0),
                    )))?;
                    window.set_size(tauri::LogicalSize::new(
                        width.min(1180.0),
                        height.min(760.0),
                    ))?;
                    window.center()?;
                }
                window.show()?;
            }
            #[cfg(mobile)]
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            knowledge::knowledge_key_status,
            knowledge::set_knowledge_key,
            knowledge::delete_knowledge_key,
            knowledge::knowledge_cancel,
            knowledge::knowledge_answer,
            knowledge::invalidate_knowledge_roots,
            knowledge::clear_knowledge_index,
            engine::notes::notes_models,
            engine::notes::notes_generate,
            engine::notes::notes_generate_nvidia,
            engine::notes::notes_cancel,
            engine::groq::set_groq_key,
            engine::groq::has_groq_key,
            engine::groq::delete_groq_key,
            engine::deepgram::set_deepgram_key,
            engine::deepgram::has_deepgram_key,
            engine::deepgram::delete_deepgram_key,
            engine::engine_capabilities,
            engine::permissions::engine_request_audio_permission,
            engine::permissions::engine_open_audio_settings,
            engine::engine_models,
            engine::engine_install_model,
            engine::engine_prepare_model,
            engine::engine_cancel_preparation,
            engine::engine_cancel_install,
            engine::engine_start,
            engine::engine_pause,
            engine::engine_stop,
            engine::engine_status,
            engine::engine_recover,
            engine::engine_delete_meeting,
            engine::engine_clear_history,
            storage::load_database,
            storage::save_database,
            share_iphone_document,
            providers::set_api_key,
            providers::has_api_key,
            providers::delete_api_key,
            providers::ask_gemini,
            providers::cancel_gemini,
            focus::open_notification_settings
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Buddy")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                if engine::protect_exit(app) {
                    api.prevent_exit();
                } else {
                    engine::shutdown(app);
                }
            }
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                if engine::protect_exit(app) {
                    api.prevent_close();
                }
            }
            _ => {}
        });
}

#[tauri::command]
async fn share_iphone_document(bytes: Vec<u8>, name: String) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        engine::ios::share(bytes, name).await
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (bytes, name);
        Err("The iPhone share sheet is available in Buddy for iOS only.".into())
    }
}
