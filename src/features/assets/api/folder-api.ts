import { invoke } from "@tauri-apps/api/core";

export async function cancelScan(): Promise<string> {
  return invoke<string>("cancel_scan");
}

export async function clearAssetDb(): Promise<string> {
  return invoke<string>("clear_db");
}

export async function scanAndImportFolder(folderPath: string): Promise<string> {
  return invoke<string>("scan_and_import_folder", {
    folderPath,
  });
}

export async function deleteAssetFile(path: string): Promise<string> {
  return invoke<string>("delete_file", { path });
}

export async function startFolderWatcher(folderPath: string): Promise<void> {
  await invoke<string>("stop_folder_watcher");
  await invoke<string>("trigger_folder_watcher", {
    folderPath,
  });
}
