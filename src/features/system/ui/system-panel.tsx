import type { DependencyStatus } from "@/features/system/api/system-api";
import { Button } from "@/shared/ui/button";

type SystemPanelProps = {
  dependencies: DependencyStatus | null;
  loading: boolean;
  statusMessage: string;
  onCheck: () => void;
  onInstall: () => void;
};

export function SystemPanel({
  dependencies,
  loading,
  statusMessage,
  onCheck,
  onInstall,
}: SystemPanelProps) {
  return (
    <section className="pane">
      <header className="pane-head">
        <h2>System</h2>
        <div className="row-actions">
          <Button type="button" onClick={onCheck} disabled={loading}>
            Check
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onInstall}
            disabled={loading}
          >
            Install
          </Button>
        </div>
      </header>
      <div className="kv-grid">
        <p>yt-dlp</p>
        <strong>
          {dependencies?.ytDlpInstalled ? "Installed" : "Missing"}
        </strong>
        <p>ffmpeg</p>
        <strong>
          {dependencies?.ffmpegInstalled ? "Installed" : "Missing"}
        </strong>
        <p>ffprobe</p>
        <strong>
          {dependencies?.ffprobeInstalled ? "Installed" : "Missing"}
        </strong>
        <p>deno</p>
        <strong>{dependencies?.denoInstalled ? "Installed" : "Missing"}</strong>
      </div>
      <p className="status">{statusMessage}</p>
    </section>
  );
}
