mod v2;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = v2::setup(app.handle().clone())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            v2::v2_scan_start,
            v2::v2_scan_sync_root,
            v2::v2_scan_stop,
            v2::v2_scan_roots_list,
            v2::v2_scan_root_remove,
            v2::v2_scan_cleanup_orphans,
            v2::v2_assets_query,
            v2::v2_asset_prefetch,
            v2::v2_jobs_list,
            v2::v2_jobs_cancel,
            v2::v2_jobs_subscribe,
            v2::v2_asset_mutation,
            v2::v2_media_trim,
            v2::v2_dependencies_status,
            v2::v2_dependencies_install,
            v2::v2_dependencies_update,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = run_result {
        eprintln!("error while running tauri application: {}", error);
    }
}
