import { invoke } from "@tauri-apps/api/core";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// src/utils/image.ts (contoh file baru)

/**
 * Mengkonversi array of numbers (dari Vec<u8> Rust) menjadi Data URL.
 * Asumsi format gambar adalah WebP.
 * @param blobData Array of numbers yang merepresentasikan data binary gambar.
 * @returns Data URL string, atau null jika input tidak valid.
 */
export const createThumbnailUrl = (blobData?: number[]): string | undefined => {
  if (!blobData || blobData.length === 0) {
    return undefined;
  }

  const uint8Array = new Uint8Array(blobData);

  const blob = new Blob([uint8Array], { type: "image/webp" });

  return URL.createObjectURL(blob);
};

export const revokeThumbnailUrl = (url: string | undefined) => {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
};

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
  const watcher = await invoke<string>("stop_folder_watcher").then(() =>
    invoke<string>("trigger_folder_watcher", { folderPath: parentPath }),
  );
  console.log(watcher);
};
