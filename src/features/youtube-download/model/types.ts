export type DownloadType = "audio" | "video";

export type DependenciesCheckResponse = {
  yt_dlp_installed: boolean;
  ffprobe_installed: boolean;
  ffmpeg_installed: boolean;
  deno_installed: boolean;
};

export type DependencyItem = {
  key: "ffmpeg" | "ffprobe" | "yt-dlp" | "deno";
  installed: boolean | undefined;
};

export type OptionItem = {
  value: string;
  label: string;
};
