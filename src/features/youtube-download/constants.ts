import type { OptionItem } from "@/features/youtube-download/model/types";

export const YOUTUBE_QUALITY_OPTIONS: OptionItem[] = [
  { value: "best", label: "Best" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
  { value: "360p", label: "360p" },
];

export const YOUTUBE_VIDEO_FORMAT_OPTIONS: OptionItem[] = [
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
  { value: "mkv", label: "MKV" },
];

export const YOUTUBE_AUDIO_FORMAT_OPTIONS: OptionItem[] = [
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A" },
  { value: "opus", label: "Opus" },
  { value: "wav", label: "WAV" },
];
