import {
  AudioLines,
  Download,
  FolderOpen,
  Link2,
  Loader2,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  DownloadType,
  OptionItem,
} from "@/features/youtube-download/model/types";

type YoutubeDownloadFormProps = {
  url: string;
  onUrlChange: (value: string) => void;
  downloadType: DownloadType;
  onDownloadTypeChange: (type: DownloadType) => void;
  format: string;
  onFormatChange: (format: string) => void;
  formatOptions: OptionItem[];
  quality: string;
  onQualityChange: (quality: string) => void;
  qualityOptions: OptionItem[];
  downloadPath: string | null;
  onBrowseDestination: () => void;
  videoProgress: number;
  errorMsg: string;
  isLoading: boolean;
  onStartDownload: () => void;
};

export default function YoutubeDownloadForm({
  url,
  onUrlChange,
  downloadType,
  onDownloadTypeChange,
  format,
  onFormatChange,
  formatOptions,
  quality,
  onQualityChange,
  qualityOptions,
  downloadPath,
  onBrowseDestination,
  videoProgress,
  errorMsg,
  isLoading,
  onStartDownload,
}: YoutubeDownloadFormProps) {
  return (
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
          onChange={(event) => onUrlChange(event.target.value)}
          className="w-full"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Type</label>
          <div className="grid grid-cols-2 gap-1">
            <Button
              variant={downloadType === "video" ? "default" : "outline"}
              onClick={() => onDownloadTypeChange("video")}
            >
              <Video className="size-4" />
              Video
            </Button>
            <Button
              variant={downloadType === "audio" ? "default" : "outline"}
              onClick={() => onDownloadTypeChange("audio")}
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
                onClick={() => onFormatChange(option.value)}
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
                onClick={() => onQualityChange(option.value)}
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
            onClick={onBrowseDestination}
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
        onClick={onStartDownload}
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
  );
}
