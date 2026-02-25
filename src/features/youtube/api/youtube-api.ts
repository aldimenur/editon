import { tauriInvoke } from "@/shared/api/tauri-client";

export type YtdlpFormatOption = {
  formatId: string;
  ext: string;
  resolution: string | null;
  vcodec: string | null;
  acodec: string | null;
  filesize: number | null;
  formatNote: string | null;
};

export type YtdlpProbeResult = {
  id: string | null;
  title: string | null;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string | null;
  formats: YtdlpFormatOption[];
};

export type YtdlpDownloadInput = {
  url: string;
  outputDir: string;
  format?: string;
  mode?: "video" | "audio";
  extractAudio?: boolean;
  audioFormat?: string;
  audioQuality?: string;
  filenameTemplate?: string;
  noPlaylist?: boolean;
  embedThumbnail?: boolean;
  embedMetadata?: boolean;
  writeSubtitles?: boolean;
  writeThumbnail?: boolean;
};

export async function probeYoutube(url: string) {
  return tauriInvoke<YtdlpProbeResult>("v2_ytdlp_probe", { url });
}

export async function queueYoutubeDownload(input: YtdlpDownloadInput) {
  return tauriInvoke<string>("v2_ytdlp_download", { input });
}
