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
import { getQaFlag, isBrowserQaMode, isTauriRuntime } from "@/lib/runtime";

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

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getQaDependencies(): DependenciesCheckResponse {
  const preset = getQaFlag("deps");
  if (preset === "missing") {
    return {
      yt_dlp_installed: false,
      ffprobe_installed: false,
      ffmpeg_installed: false,
      deno_installed: false,
    };
  }

  return {
    yt_dlp_installed: true,
    ffprobe_installed: true,
    ffmpeg_installed: true,
    deno_installed: true,
  };
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
  const isBrowserQa = isBrowserQaMode();

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
    setErrorMsg("");

    try {
      if (!isTauriRuntime()) {
        if (isBrowserQa) {
          await wait(350);
          setDependenciesMsg(getQaDependencies());
          return;
        }

        setDependenciesMsg(undefined);
        return;
      }

      const response = await checkDependenciesApi();
      setDependenciesMsg(response);
    } catch (error) {
      console.error("Failed to check dependencies", error);
      setErrorMsg("Dependency check failed.");
    } finally {
      setIsLoading(false);
    }
  }, [isBrowserQa]);

  const downloadDependencies = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg("");

    try {
      if (!isTauriRuntime()) {
        if (!isBrowserQa) {
          setErrorMsg("Dependencies can only be installed in desktop app.");
          return;
        }

        setProgress(0);
        for (let i = 1; i <= 10; i += 1) {
          await wait(130);
          setProgress(i * 10);
        }

        setDependenciesMsg({
          yt_dlp_installed: true,
          ffprobe_installed: true,
          ffmpeg_installed: true,
          deno_installed: true,
        });
        return;
      }

      await downloadDependenciesApi();
      await checkDependencies();
      setProgress(0);
    } catch (error) {
      console.error("Failed to download dependencies", error);
      setErrorMsg("Failed to download dependencies.");
    } finally {
      setIsLoading(false);
    }
  }, [checkDependencies, isBrowserQa]);

  const startDownload = useCallback(async () => {
    setErrorMsg("");
    setVideoProgress(0);
    setIsLoading(true);

    if (!isValidUrl(url.trim())) {
      setErrorMsg("Invalid URL.");
      setIsLoading(false);
      return;
    }

    if (!downloadPath?.trim()) {
      setErrorMsg("Destination required.");
      setIsLoading(false);
      return;
    }

    if (!isTauriRuntime()) {
      if (!isBrowserQa) {
        setErrorMsg("Download only runs in desktop app.");
        setIsLoading(false);
        return;
      }

      for (let i = 1; i <= 8; i += 1) {
        await wait(220);
        setVideoProgress(i * 12.5);
      }

      setVideoProgress(100);
      setIsLoading(false);
      return;
    }

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
  }, [downloadPath, downloadType, format, isBrowserQa, quality, url]);

  const browseDestination = useCallback(async () => {
    try {
      if (!isTauriRuntime()) {
        if (isBrowserQa) {
          setDownloadPath("C:/Downloads");
          return;
        }

        return;
      }

      const path = await browseDownloadDirectory();
      if (path) {
        setDownloadPath(path);
      }
    } catch (error) {
      console.error("Failed to browse destination", error);
    }
  }, [isBrowserQa]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlistenYtdlpOutput: (() => void) | undefined;
    let unlistenFfmpeg: (() => void) | undefined;
    let unlistenYtdlpDep: (() => void) | undefined;
    let unlistenDeno: (() => void) | undefined;

    const attachListeners = async () => {
      const { listen } = await import("@tauri-apps/api/event");

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
    if (isBrowserQa && !downloadPath) {
      setDownloadPath("C:/Downloads");
    }
  }, [downloadPath, isBrowserQa]);

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
    setDownloadPath,
    isLoading,
    isBrowserQa,
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
