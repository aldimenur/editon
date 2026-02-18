import { Download, HardDriveDownload } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DependencyItem } from "@/features/youtube-download/model/types";

type YoutubeDependenciesPanelProps = {
  dependencyItems: DependencyItem[];
  allDependenciesInstalled: boolean;
  progress: number;
  isLoading: boolean;
  onCheckDependencies: () => void;
  onDownloadDependencies: () => void;
};

export default function YoutubeDependenciesPanel({
  dependencyItems,
  allDependenciesInstalled,
  progress,
  isLoading,
  onCheckDependencies,
  onDownloadDependencies,
}: YoutubeDependenciesPanelProps) {
  return (
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
          onClick={onCheckDependencies}
          loading={isLoading}
        >
          <HardDriveDownload className="size-4" />
          Check dependencies
        </Button>
        <Button
          variant="outline"
          onClick={onDownloadDependencies}
          loading={isLoading}
        >
          <Download className="size-4" />
          Download dependencies
        </Button>
      </div>
    </div>
  );
}
