import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";

export type dependenciesCheckResponse = {
  yt_dlp_installed: boolean;
  ffprobe_installed: boolean;
  ffmpeg_installed: boolean
}

const YoutubeDownloadPage = () => {
  const [progress, setProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [downloadType, setDownloadType] = useState<"audio" | "video">("video");
  const [quality, setQuality] = useState("best");
  const [format, setFormat] = useState("mp4");
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setSerrorMsg] = useState<string>("");
  const [dependenciesCheckMsg, setDependenciesMsg] = useState<dependenciesCheckResponse>();


  const parseProgress = (line: string): number | null => {
    const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (progressMatch) {
      const progress = parseFloat(progressMatch[1]);
      return Math.min(100, Math.max(0, progress)); // Clamp between 0-100
    }

    return null;
  }

  const checkDependencies = async () => {
    setIsLoading(true)
    try {
      const response = await invoke("check_dependencies") as dependenciesCheckResponse;
      setDependenciesMsg(response)
    } catch (error) {
      console.log(error)
    }
    setIsLoading(false)
  }

  const downloadDependencies = async () => {
    setIsLoading(true)
    try {
      const response = await invoke("download_dependencies");

      console.log(response)
    } catch (err) {
      console.log(err)
    }
    setIsLoading(false)
  }

  const downloadVideo = async () => {
    setSerrorMsg("");
    setVideoProgress(0);
    setIsLoading(true)

    const audioArgs = ["-x", "--audio-format", format]

    const args = [url, "-P", downloadPath || ".", "--no-playlist"]

    if (downloadType === "audio") {
      args.push(...audioArgs)
    }

    const res = await invoke("run_ytdlp", { args }).catch((e) => { setIsLoading(false); setSerrorMsg(e) })

    if (res == "Success") {
      setVideoProgress(100)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    let unlisten: any;

    async function listener() {
      unlisten = await listen('ytdlp-output', (e: any) => {
        const line = typeof e.payload === 'string' ? e.payload : e.payload?.message || '';
        const progressValue = parseProgress(line);

        if (progressValue !== null) {
          setVideoProgress(progressValue);
        }
      })

      unlisten = await listen('ffmpeg-download-progress', (e) => {
        setProgress(e.payload as number);

        if (e.payload === 100) {
          return false;
        }
      })

      unlisten = await listen('yt-dlp-download-progress', (e: any) => {
        setProgress(e.payload.progress);

        if (e.progress === 100) {
          return false;
        }
      })
    }

    listener()

    return () => {
      if (unlisten) unlisten();
    }
  }, [])

  useEffect(() => {
    checkDependencies();
  }, [])

  const handleBrowseDestination = async () => {
    try {
      const path = await open({
        directory: true,
      });
      if (path) {
        setDownloadPath(path);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const qualityOptions = [
    { value: "best", label: "Best" },
    { value: "1080p", label: "1080p" },
    { value: "720p", label: "720p" },
    { value: "480p", label: "480p" },
    { value: "360p", label: "360p" },
  ];

  const formatOptions = downloadType === "video"
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

  return (
    <div className="px-3 max-w-2xl mx-auto space-y-6 max-h-[calc(100vh-40px)] overflow-auto">
      <div className="space-y-2">
        <label className="text-sm font-medium">YouTube URL</label>
        <Input
          type="text"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Download Type</label>
        <div className="flex gap-2">
          <Button
            variant={downloadType === "video" ? "default" : "outline"}
            onClick={() => setDownloadType("video")}
            className="flex-1"
          >
            Video
          </Button>
          <Button
            variant={downloadType === "audio" ? "default" : "outline"}
            onClick={() => setDownloadType("audio")}
            className="flex-1"
          >
            Audio
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Quality</label>
        <div className="flex flex-wrap gap-2">
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

      <div className="space-y-2">
        <label className="text-sm font-medium">Format</label>
        <div className="flex flex-wrap gap-2">
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

      <div className="space-y-2">
        <label className="text-sm font-medium">Download Destination</label>
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
            <FolderOpen className="size-4 mr-2" />
            Browse
          </Button>
        </div>
      </div>

      {videoProgress > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Download Progress</span>
            <span>{Math.round(videoProgress)}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${videoProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-2 pt-4">
        <Button
          variant="default"
          onClick={downloadVideo}
          disabled={!url || !downloadPath}
          className="flex-1"
          loading={isLoading}
        >
          Download
        </Button>
        <Button variant="outline" onClick={checkDependencies} loading={isLoading}>
          Check Dependencies
        </Button>
        <Button variant="outline" onClick={downloadDependencies} loading={isLoading}>
          Download Dependencies
        </Button>
      </div>
      {errorMsg && <span className="text-red-500">{errorMsg}</span>}
      {progress !== 0 && <span className="text-blue-500 text-xs">Downloading dependencies {progress}%</span>}
      <div className="flex flex-col">
        {dependenciesCheckMsg?.ffmpeg_installed ? <span className="text-blue-500 text-xs">ffmpeg sudah terinstall.</span> : <span className="text-red-500 text-xs">ffmpeg Belum terinstall</span>}
        {dependenciesCheckMsg?.ffprobe_installed ? <span className="text-blue-500 text-xs">ffprobe sudah terinstall.</span> : <span className="text-red-500 text-xs">ffprobe belum terinstall</span>}
        {dependenciesCheckMsg?.yt_dlp_installed ? <span className="text-blue-500 text-xs">yt_dlp sudah terinstall.</span> : <span className="text-red-500 text-xs">yt_dlp Belum terinstall</span>}
      </div>
    </div>
  )
}

export default YoutubeDownloadPage;