import { open } from "@tauri-apps/plugin-dialog";

import type { ScanRoot } from "@/features/assets/api/assets-api";
import { formatDate } from "@/shared/lib/format/date";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type AssetToolbarProps = {
  rootPath: string;
  loading: boolean;
  canStop: boolean;
  scanRoots: ScanRoot[];
  syncingRootPath: string | null;
  removingRootPath: string | null;
  onRootPathChange: (value: string) => void;
  onBrowsePath: (value: string) => void;
  onStartScan: () => void;
  onSyncRoot: (rootPath: string) => void;
  onRemoveRoot: (rootPath: string) => void;
  onStopScan: () => void;
  onReload: () => void;
};

export function AssetToolbar({
  rootPath,
  loading,
  canStop,
  scanRoots,
  syncingRootPath,
  removingRootPath,
  onRootPathChange,
  onBrowsePath,
  onStartScan,
  onSyncRoot,
  onRemoveRoot,
  onStopScan,
  onReload,
}: AssetToolbarProps) {
  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose asset folder",
    });

    if (typeof selected === "string" && selected.trim().length > 0) {
      onBrowsePath(selected);
    }
  };

  return (
    <>
      <div className="toolbar">
        <Input
          value={rootPath}
          onChange={(event) => onRootPathChange(event.target.value)}
          placeholder="F:/Projects/Assets"
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => void handleBrowse()}
          disabled={loading}
        >
          Browse
        </Button>
        <Button type="button" onClick={onStartScan} disabled={loading}>
          Scan
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onStopScan}
          disabled={!canStop || loading}
        >
          Stop
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onReload}
          disabled={loading}
        >
          Reload
        </Button>
      </div>
      {scanRoots.length > 0 ? (
        <div className="toolbar">
          {scanRoots.map((root) => (
            <div key={root.rootPath} className="meta">
              <span>{root.rootPath}</span>
              <span>
                {root.dateLastScanned
                  ? `last sync ${formatDate(root.dateLastScanned)}`
                  : `added ${formatDate(root.dateAdded)}`}
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={
                  loading ||
                  syncingRootPath === root.rootPath ||
                  removingRootPath === root.rootPath
                }
                onClick={() => onSyncRoot(root.rootPath)}
              >
                {syncingRootPath === root.rootPath ? "Syncing..." : "Sync"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={
                  loading ||
                  syncingRootPath === root.rootPath ||
                  removingRootPath === root.rootPath
                }
                onClick={() => onRemoveRoot(root.rootPath)}
              >
                {removingRootPath === root.rootPath ? "Removing..." : "Remove"}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
