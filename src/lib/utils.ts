import { invoke } from "@tauri-apps/api/core";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const countAssets = async () => {
  const video = await invoke<number>("get_count_assets", {
    assetType: "video",
  });
  const audio = await invoke<number>("get_count_assets", {
    assetType: "audio",
  });
  const image = await invoke<number>("get_count_assets", {
    assetType: "image",
  });
  return { video, audio, image };
};

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const startWatcher = async (parentPath: string) => {
  await invoke<string>("stop_folder_watcher").then(() =>
    invoke<string>("trigger_folder_watcher", { folderPath: parentPath }),
  );
};
