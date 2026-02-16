import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AudioLines,
  Download,
  FolderOpen,
  HardDriveDownload,
  Link2,
  Loader2,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type DependenciesCheckResponse = {
  yt_dlp_installed: boolean;
  ffprobe_installed: boolean;
  ffmpeg_installed: boolean;
  deno_installed: boolean;
};

type YtdlpOutputPayload = string | { message?: string };
type YtdlpDependencyProgressPayload = {
  progress: number;
};

type DownloadType = "audio" | "video";

const YoutubeDownloadPage = () => {
  const [progress, setProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [downloadType, setDownloadType] = useState<DownloadType>("video");
  const [quality, setQuality] = useState("best");
  const [format, setFormat] = useState("mp4");
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [dependenciesCheckMsg, setDependenciesMsg] =
    useState<DependenciesCheckResponse>();

  const getErrorMessage = (error: unknown, fallback: string): string => {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    return fallback;
  };

  const parseProgress = (line: string): number | null => {
    const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (!progressMatch) return null;

    const parsed = parseFloat(progressMatch[1]);
    return Math.min(100, Math.max(0, parsed));
  };

  const checkDependencies = async () => {
    setIsLoading(true);
    try {
      const response =
        await invoke<DependenciesCheckResponse>("check_dependencies");
      setDependenciesMsg(response);
    } catch (error) {
      console.error("Failed to check dependencies", error);
    }
    setIsLoading(false);
  };

  const downloadDependencies = async () => {
    setIsLoading(true);
    setErrorMsg("");
    try {
      await invoke<string>("download_dependencies");
      await checkDependencies();
      setProgress(0);
    } catch (error) {
      console.error("Failed to download dependencies", error);
      setErrorMsg("Failed to download dependencies.");
    }
    setIsLoading(false);
  };

  const resolveVideoFormatArg = (): string => {
    if (quality === "best") {
      return "bestvideo+bestaudio/best";
    }

    const height = quality.replace("p", "");
    return `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
  };

  const downloadVideo = async () => {
    setErrorMsg("");
    setVideoProgress(0);
    setIsLoading(true);

    const args = [url, "-P", downloadPath || ".", "--no-playlist"];

    if (downloadType === "audio") {
      args.push("-x", "--audio-format", format);
    } else {
      args.push("-f", resolveVideoFormatArg(), "--merge-output-format", format);
    }

    try {
      const res = await invoke<string>("run_ytdlp", { args });
      if (res === "Success") {
        setVideoProgress(100);
      }
    } catch (error) {
      console.error("Failed to download media", error);
      setErrorMsg(getErrorMessage(error, "Download failed."));
    }

    setIsLoading(false);
  };

  useEffect(() => {
    let unlistenYtdlpOutput: (() => void) | undefined;
    let unlistenFfmpeg: (() => void) | undefined;
    let unlistenYtdlpDep: (() => void) | undefined;
    let unlistenDeno: (() => void) | undefined;

    const attachListeners = async () => {
      unlistenYtdlpOutput = await listen<YtdlpOutputPayload>(
        "ytdlp-output",
        (e) => {
          const line =
            typeof e.payload === "string"
              ? e.payload
              : e.payload?.message || "";
          const progressValue = parseProgress(line);

          if (progressValue !== null) {
            setVideoProgress(progressValue);
          }
        },
      );

      unlistenFfmpeg = await listen<number>("ffmpeg-download-progress", (e) => {
        setProgress(e.payload);
      });

      unlistenYtdlpDep = await listen<YtdlpDependencyProgressPayload>(
        "yt-dlp-download-progress",
        (e) => {
          setProgress(e.payload.progress);
        },
      );

      unlistenDeno = await listen<number>("deno-download-progress", (e) => {
        setProgress(e.payload);
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
  }, []);

  const handleBrowseDestination = async () => {
    try {
      const path = await open({ directory: true });
      if (typeof path === "string") {
        setDownloadPath(path);
      }
    } catch (error) {
      console.error("Failed to browse destination", error);
    }
  };

  const qualityOptions = [
    { value: "best", label: "Best" },
    { value: "1080p", label: "1080p" },
    { value: "720p", label: "720p" },
    { value: "480p", label: "480p" },
    { value: "360p", label: "360p" },
  ];

  const formatOptions =
    downloadType === "video"
      ? [
          { value: "mp4", label: "MP4" },
          { value: "webm", label: "WebM" },
          { value: "mkv", label: "MKV" },
        ]
      : [
          { value: "mp3", label: "MP3" },
          { value: "m4a", label: "M4A" },
          { value: "opus", label: "Opus" },
          { value: "wav", label: "WAV" },
        ];

  useEffect(() => {
    const isFormatStillValid = formatOptions.some(
      (item) => item.value === format,
    );
    if (!isFormatStillValid) {
      setFormat(formatOptions[0].value);
    }
  }, [downloadType]);

  const dependencyItems = useMemo(
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

  const allDependenciesInstalled = dependencyItems.every(
    (item) => item.installed,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 max-h-[calc(100vh-40px)] overflow-auto">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">YouTube Downloader</h2>
          <p className="text-xs text-muted-foreground">
            Download video or audio quickly with your preferred format and
            quality.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Link2 className="size-4" />
            URL
          </label>
          <Input
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <div className="grid grid-cols-2 gap-1">
              <Button
                variant={downloadType === "video" ? "default" : "outline"}
                onClick={() => setDownloadType("video")}
              >
                <Video className="size-4" />
                Video
              </Button>
              <Button
                variant={downloadType === "audio" ? "default" : "outline"}
                onClick={() => setDownloadType("audio")}
              >
                <AudioLines className="size-4" />
                Audio
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Format</label>
            <div className="flex flex-wrap gap-1">
              {formatOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={format === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormat(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {downloadType === "video" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Quality</label>
            <div className="flex flex-wrap gap-1">
              {qualityOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={quality === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuality(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Destination</label>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Select download folder..."
              value={downloadPath || ""}
              readOnly
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleBrowseDestination}
              className="shrink-0"
            >
              <FolderOpen className="size-4" />
              Browse
            </Button>
          </div>
        </div>

        {videoProgress > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Download progress</span>
              <span>{Math.round(videoProgress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-md border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {errorMsg}
          </div>
        )}

        <Button
          onClick={downloadVideo}
          disabled={!url.trim() || !downloadPath || isLoading}
          className="w-full"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Start Download
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Dependencies</h3>
            <p className="text-xs text-muted-foreground">
              yt-dlp, ffmpeg, ffprobe, and deno are required.
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${allDependenciesInstalled ? "bg-green-500/15 text-green-500" : "bg-yellow-500/15 text-yellow-500"}`}
          >
            {allDependenciesInstalled ? "Ready" : "Needs setup"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {dependencyItems.map((item) => (
            <div
              key={item.key}
              className={`rounded-lg border px-2 py-1.5 text-xs ${item.installed ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}
            >
              <div className="font-medium uppercase">{item.key}</div>
              <div className="text-[11px] text-muted-foreground">
                {item.installed ? "Installed" : "Missing"}
              </div>
            </div>
          ))}
        </div>

        {progress > 0 && progress < 100 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Dependency download</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={checkDependencies}
            loading={isLoading}
          >
            <HardDriveDownload className="size-4" />
            Check dependencies
          </Button>
          <Button
            variant="outline"
            onClick={downloadDependencies}
            loading={isLoading}
          >
            <Download className="size-4" />
            Download dependencies
          </Button>
        </div>
      </div>
    </div>
  );
};

export default YoutubeDownloadPage;
