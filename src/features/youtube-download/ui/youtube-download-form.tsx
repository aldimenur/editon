import {
  AudioLines,
  CheckCircle2,
  Download,
  FolderOpen,
  Link2,
  Loader2,
  Video,
  XCircle,
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
  onDownloadPathChange: (path: string) => void;
  isDestinationEditable: boolean;
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
  onDownloadPathChange,
  isDestinationEditable,
  onBrowseDestination,
  videoProgress,
  errorMsg,
  isLoading,
  onStartDownload,
}: YoutubeDownloadFormProps) {
  const isReadyToDownload = Boolean(url.trim() && downloadPath);

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b bg-muted/20 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Downloader</h2>
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.04em] text-primary">
            {downloadType}
          </span>
        </div>
      </header>

      <div className="space-y-3 px-3 py-3">
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
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

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
              Type
            </label>
            <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
              <Button
                variant={downloadType === "video" ? "default" : "ghost"}
                size="sm"
                onClick={() => onDownloadTypeChange("video")}
                className="w-full"
              >
                <Video className="size-4" />
                Video
              </Button>
              <Button
                variant={downloadType === "audio" ? "default" : "ghost"}
                size="sm"
                onClick={() => onDownloadTypeChange("audio")}
                className="w-full"
              >
                <AudioLines className="size-4" />
                Audio
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
              Format
            </label>
            <div className="flex min-h-9 flex-wrap gap-1 rounded-lg border bg-muted/20 p-1">
              {formatOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={format === option.value ? "default" : "ghost"}
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
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
              Quality
            </label>
            <div className="flex min-h-9 flex-wrap gap-1 rounded-lg border bg-muted/20 p-1">
              {qualityOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={quality === option.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onQualityChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            Destination
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="text"
              placeholder="Select destination"
              value={downloadPath || ""}
              readOnly={!isDestinationEditable}
              onChange={(event) => onDownloadPathChange(event.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={onBrowseDestination}
              className="shrink-0"
              size="sm"
            >
              <FolderOpen className="size-4" />
              {isDestinationEditable ? "Pick" : "Browse"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 px-2.5 py-2 text-xs">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="inline-flex items-center gap-1.5">
              {url.trim() ? (
                <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="size-3.5 text-yellow-600 dark:text-yellow-400" />
              )}
              <span className="text-muted-foreground">URL</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              {downloadPath ? (
                <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="size-3.5 text-yellow-600 dark:text-yellow-400" />
              )}
              <span className="text-muted-foreground">Destination</span>
            </div>
          </div>
        </div>

        {videoProgress > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Download progress</span>
              <span>{Math.round(videoProgress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-gradient-to-r from-primary via-primary to-primary/70 transition-all duration-300"
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
          disabled={!isReadyToDownload || isLoading}
          className="h-9 w-full"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Download
        </Button>
      </div>
    </section>
  );
}
