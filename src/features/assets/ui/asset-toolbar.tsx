import { open } from "@tauri-apps/plugin-dialog";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type AssetToolbarProps = {
  rootPath: string;
  loading: boolean;
  canStop: boolean;
  onRootPathChange: (value: string) => void;
  onBrowsePath: (value: string) => void;
  onStartScan: () => void;
  onStopScan: () => void;
  onReload: () => void;
};

export function AssetToolbar({
  rootPath,
  loading,
  canStop,
  onRootPathChange,
  onBrowsePath,
  onStartScan,
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
  );
}
