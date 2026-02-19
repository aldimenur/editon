import {
  CheckCircle2,
  Download,
  HardDriveDownload,
  PackageOpen,
  XCircle,
} from "lucide-react";

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
  const installedCount = dependencyItems.filter(
    (item) => item.installed,
  ).length;

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b bg-muted/20 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <PackageOpen className="size-4 text-emerald-600 dark:text-emerald-400" />
            Dependencies
          </h3>
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${allDependenciesInstalled ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"}`}
          >
            {installedCount}/{dependencyItems.length} ready
          </span>
        </div>
      </header>

      <div className="space-y-3 px-3 py-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {dependencyItems.map((item) => (
            <div
              key={item.key}
              className={`rounded-lg border p-2 text-xs ${item.installed ? "border-green-500/30 bg-green-500/10" : "border-destructive/40 bg-destructive/10"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium uppercase tracking-[0.03em]">
                  {item.key}
                </span>
                {item.installed ? (
                  <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="size-3.5 text-destructive" />
                )}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
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
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-emerald-500 to-emerald-400 transition-all duration-300"
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
            size="sm"
          >
            <HardDriveDownload className="size-4" />
            Check
          </Button>
          <Button
            variant="outline"
            onClick={onDownloadDependencies}
            loading={isLoading}
            size="sm"
          >
            <Download className="size-4" />
            Install
          </Button>
        </div>
      </div>
    </section>
  );
}
