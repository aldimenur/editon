import type { DependencyStatus } from "@/features/system/api/system-api";
import { Button } from "@/shared/ui/button";

type SystemPanelProps = {
  dependencies: DependencyStatus | null;
  loading: boolean;
  statusMessage: string;
  onCheck: () => void;
  onInstall: () => void;
  onUpdate: () => void;
};

export function SystemPanel({
  dependencies,
  loading,
  statusMessage,
  onCheck,
  onInstall,
  onUpdate,
}: SystemPanelProps) {
  const dependencyRows = [
    { label: "yt-dlp", installed: Boolean(dependencies?.ytDlpInstalled) },
    { label: "ffmpeg", installed: Boolean(dependencies?.ffmpegInstalled) },
    { label: "ffprobe", installed: Boolean(dependencies?.ffprobeInstalled) },
    { label: "deno", installed: Boolean(dependencies?.denoInstalled) },
  ];

  return (
    <section className="pane settings-card settings-maintenance-card">
      <header className="settings-card-head">
        <div className="settings-card-heading">
          <p className="settings-card-kicker">Maintenance</p>
          <h2>Dependencies</h2>
          <p className="settings-card-note">
            Verify and install tooling used for media analysis and downloads.
          </p>
        </div>
        <div className="row-actions settings-card-actions">
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
          <Button
            type="button"
            variant="ghost"
            onClick={onUpdate}
            disabled={loading}
          >
            Update
          </Button>
        </div>
      </header>
      <div className="settings-dependency-grid">
        {dependencyRows.map((row) => (
          <div className="settings-dependency-row" key={row.label}>
            <p>{row.label}</p>
            <span
              className={`settings-pill ${
                row.installed ? "settings-pill-ready" : "settings-pill-error"
              }`}
            >
              {row.installed ? "Installed" : "Missing"}
            </span>
          </div>
        ))}
      </div>
      <p className="status settings-inline-status">{statusMessage}</p>
    </section>
  );
}
