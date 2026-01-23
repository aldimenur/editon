import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";

const YoutubeDownloadPage = () => {
  const [, setProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [downloadType, setDownloadType] = useState<"audio" | "video">("video");
  const [quality, setQuality] = useState("best");
  const [format, setFormat] = useState("mp4");
  const [downloadPath, setDownloadPath] = useState<string | null>(null);

  const parseProgress = (line: string): number => {
    // Pola utama: "[download]  45.2% of    9.89MiB at ..."
    const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (progressMatch) {
      return parseFloat(progressMatch[1]);
    }

    // Pola alternatif untuk 100%: "[download] 100% of ..."
    const fullMatch = line.match(/\[download\]\s+100%/);
    if (fullMatch) {
      return 100.0;
    }

    return 0;
  }

  const checkDependencies = async () => {
    const response = await invoke("check_dependencies") as { yt_dlp_installed: boolean; bin_dir: string };
    console.log(response);
  }

  const downloadDependencies = async () => {
    const response = await invoke("download_dependencies");
    console.log(response);
  }

  const downloadVideo = async () => {
    const args = [url, "--progress", "-P", downloadPath]

    const res = await invoke("run_ytdlp", { args })

    if (res == "Success") {
      return setVideoProgress(100)
    }
  }

  useEffect(() => {
    let unlisten: any;

    async function listener() {
      unlisten = await listen('ytdlp-output', (e: any) => {
        const progressValue = parseProgress(e.payload.message)
        setVideoProgress(progressValue)
      })
    }

    listener()
    // window.location.reload();

    return () => {
      if (unlisten) unlisten();
    }
  }, [])

  useEffect(() => {
    let unlisten: any;

    async function listener() {
      unlisten = await listen('ffmpeg-download-progress', (e) => {
        setProgress(e.payload as number);

        if (e.payload === 100) {
          return false;
        }
      })

      unlisten = await listen('download-progress', (e: any) => {
        console.log(e);
        setProgress(e.progress);

        if (e.progress === 100) {
          return false;
        }
      })
    }

    listener()
    // window.location.reload();

    return () => {
      if (unlisten) unlisten();
    }
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
    <div className="px-6 max-w-2xl mx-auto space-y-6">
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

      <div className="flex gap-2 pt-4">
        <Button
          variant="default"
          onClick={downloadVideo}
          disabled={!url || !downloadPath}
          className="flex-1"
        >
          Download
        </Button>
        <Button variant="outline" onClick={checkDependencies}>
          Check Dependencies
        </Button>
        <Button variant="outline" onClick={downloadDependencies}>
          Download Dependencies
        </Button>
      </div>
    </div>
  )
}

export default YoutubeDownloadPage;