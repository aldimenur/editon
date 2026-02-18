import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  browseDownloadDirectory,
  checkDependencies as checkDependenciesApi,
  downloadDependencies as downloadDependenciesApi,
  runYtdlp,
} from "@/features/youtube-download/api/youtube-download-api";
import {
  YOUTUBE_AUDIO_FORMAT_OPTIONS,
  YOUTUBE_QUALITY_OPTIONS,
  YOUTUBE_VIDEO_FORMAT_OPTIONS,
} from "@/features/youtube-download/constants";
import type {
  DependenciesCheckResponse,
  DependencyItem,
  DownloadType,
  OptionItem,
} from "@/features/youtube-download/model/types";

type YtdlpOutputPayload = string | { message?: string };
type YtdlpDependencyProgressPayload = {
  progress: number;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return fallback;
}

function parseProgress(line: string): number | null {
  const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (!progressMatch) return null;

  const parsed = parseFloat(progressMatch[1]);
  return Math.min(100, Math.max(0, parsed));
}

function resolveVideoFormatArg(quality: string): string {
  if (quality === "best") {
    return "bestvideo+bestaudio/best";
  }

  const height = quality.replace("p", "");
  return `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
}

export function useYoutubeDownload() {
  const [progress, setProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [downloadType, setDownloadType] = useState<DownloadType>("video");
  const [quality, setQuality] = useState("best");
  const [format, setFormat] = useState("mp4");
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [dependenciesCheckMsg, setDependenciesMsg] =
    useState<DependenciesCheckResponse>();

  const formatOptions = useMemo<OptionItem[]>(
    () =>
      downloadType === "video"
        ? YOUTUBE_VIDEO_FORMAT_OPTIONS
        : YOUTUBE_AUDIO_FORMAT_OPTIONS,
    [downloadType],
  );

  const dependencyItems = useMemo<DependencyItem[]>(
    () => [
      {
        key: "ffmpeg",
        installed: dependenciesCheckMsg?.ffmpeg_installed,
      },
      {
        key: "ffprobe",
        installed: dependenciesCheckMsg?.ffprobe_installed,
      },
      {
        key: "yt-dlp",
        installed: dependenciesCheckMsg?.yt_dlp_installed,
      },
      {
        key: "deno",
        installed: dependenciesCheckMsg?.deno_installed,
      },
    ],
    [dependenciesCheckMsg],
  );

  const allDependenciesInstalled = useMemo(
    () => dependencyItems.every((item) => item.installed),
    [dependencyItems],
  );

  const checkDependencies = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await checkDependenciesApi();
      setDependenciesMsg(response);
    } catch (error) {
      console.error("Failed to check dependencies", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const downloadDependencies = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg("");

    try {
      await downloadDependenciesApi();
      await checkDependencies();
      setProgress(0);
    } catch (error) {
      console.error("Failed to download dependencies", error);
      setErrorMsg("Failed to download dependencies.");
    } finally {
      setIsLoading(false);
    }
  }, [checkDependencies]);

  const startDownload = useCallback(async () => {
    setErrorMsg("");
    setVideoProgress(0);
    setIsLoading(true);

    const args = [url, "-P", downloadPath || ".", "--no-playlist"];

    if (downloadType === "audio") {
      args.push("-x", "--audio-format", format);
    } else {
      args.push(
        "-f",
        resolveVideoFormatArg(quality),
        "--merge-output-format",
        format,
      );
    }

    try {
      const result = await runYtdlp(args);
      if (result === "Success") {
        setVideoProgress(100);
      }
    } catch (error) {
      console.error("Failed to download media", error);
      setErrorMsg(getErrorMessage(error, "Download failed."));
    } finally {
      setIsLoading(false);
    }
  }, [downloadPath, downloadType, format, quality, url]);

  const browseDestination = useCallback(async () => {
    try {
      const path = await browseDownloadDirectory();
      if (path) {
        setDownloadPath(path);
      }
    } catch (error) {
      console.error("Failed to browse destination", error);
    }
  }, []);

  useEffect(() => {
    let unlistenYtdlpOutput: (() => void) | undefined;
    let unlistenFfmpeg: (() => void) | undefined;
    let unlistenYtdlpDep: (() => void) | undefined;
    let unlistenDeno: (() => void) | undefined;

    const attachListeners = async () => {
      unlistenYtdlpOutput = await listen<YtdlpOutputPayload>(
        "ytdlp-output",
        (event) => {
          const line =
            typeof event.payload === "string"
              ? event.payload
              : event.payload?.message || "";
          const progressValue = parseProgress(line);

          if (progressValue !== null) {
            setVideoProgress(progressValue);
          }
        },
      );

      unlistenFfmpeg = await listen<number>(
        "ffmpeg-download-progress",
        (event) => {
          setProgress(event.payload);
        },
      );

      unlistenYtdlpDep = await listen<YtdlpDependencyProgressPayload>(
        "yt-dlp-download-progress",
        (event) => {
          setProgress(event.payload.progress);
        },
      );

      unlistenDeno = await listen<number>("deno-download-progress", (event) => {
        setProgress(event.payload);
      });
    };

    void attachListeners();

    return () => {
      unlistenYtdlpOutput?.();
      unlistenFfmpeg?.();
      unlistenYtdlpDep?.();
      unlistenDeno?.();
    };
  }, []);

  useEffect(() => {
    void checkDependencies();
  }, [checkDependencies]);

  useEffect(() => {
    const isFormatStillValid = formatOptions.some(
      (option) => option.value === format,
    );
    if (!isFormatStillValid) {
      setFormat(formatOptions[0].value);
    }
  }, [format, formatOptions]);

  return {
    progress,
    videoProgress,
    url,
    setUrl,
    downloadType,
    setDownloadType,
    quality,
    setQuality,
    format,
    setFormat,
    downloadPath,
    isLoading,
    errorMsg,
    qualityOptions: YOUTUBE_QUALITY_OPTIONS,
    formatOptions,
    dependencyItems,
    allDependenciesInstalled,
    checkDependencies,
    downloadDependencies,
    startDownload,
    browseDestination,
  };
}
