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
  
  // Ubah number[] menjadi Uint8Array
  const uint8Array = new Uint8Array(blobData);

  // Buat Blob dari Uint8Array
  // Penting: tentukan MIME type yang benar, sesuai dengan format yang Anda simpan (WebP)
  const blob = new Blob([uint8Array], { type: 'image/webp' });

  // Buat Object URL dari Blob
  return URL.createObjectURL(blob);
};

// Pastikan untuk me-revoke Object URL jika tidak lagi digunakan
// Ini penting untuk mencegah memory leak, terutama jika banyak thumbnail dirender dan di-unmount.
export const revokeThumbnailUrl = (url: string | undefined) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};