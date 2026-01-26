import { invoke } from "@tauri-apps/api/core";
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

  const blob = new Blob([uint8Array], { type: 'image/webp' });

  return URL.createObjectURL(blob);
};

export const revokeThumbnailUrl = (url: string | undefined) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};


export const countAssets = {
  audio: async () => {
    const audio = await invoke("get_count_assets", { assetType: "audio" }) as number
    return audio
  },
  video: async () => {
    const video = await invoke("get_count_assets", { assetType: "video" }) as number
    return video
  },
  image: async () => {
    const image = await invoke("get_count_assets", { assetType: "image" }) as number
    return image
  }
}