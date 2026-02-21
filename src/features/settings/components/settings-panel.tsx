import { useState } from "react";

import {
  getDependenciesStatus,
  installDependencies,
  type DependencyStatus,
} from "@/features/backend/api/backend-api";
import { canUseTauri } from "@/shared/lib/tauri-client";
import { SectionCard } from "@/shared/ui/section-card";

export function SettingsPanel() {
  const [status, setStatus] = useState<DependencyStatus | null>(null);
  const [message, setMessage] = useState<string>("No action yet.");
  const [busy, setBusy] = useState(false);

  const handleCheck = async () => {
    if (!canUseTauri()) {
      setMessage("Run in Tauri mode to check dependency status.");
      return;
    }

    setBusy(true);
    try {
      const result = await getDependenciesStatus();
      setStatus(result);
      setMessage("Dependency status loaded.");
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Failed to load status",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = async () => {
    if (!canUseTauri()) {
      setMessage("Run in Tauri mode to queue dependency install.");
      return;
    }

    setBusy(true);
    try {
      const result = await installDependencies();
      setMessage(result);
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Failed to queue install",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Settings"
      subtitle="Dependency and backend control"
      actions={<span className="pill">Backend v2</span>}
    >
      <div className="actions-row">
        <button
          type="button"
          className="btn"
          onClick={handleCheck}
          disabled={busy}
        >
          Check Dependencies
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={handleInstall}
          disabled={busy}
        >
          Queue Install
        </button>
      </div>
      <p className="state">{message}</p>
      {status ? (
        <ul className="kv-list">
          <li>
            <span>yt-dlp</span>
            <strong>{status.ytDlpInstalled ? "Installed" : "Missing"}</strong>
          </li>
          <li>
            <span>ffmpeg</span>
            <strong>{status.ffmpegInstalled ? "Installed" : "Missing"}</strong>
          </li>
          <li>
            <span>ffprobe</span>
            <strong>{status.ffprobeInstalled ? "Installed" : "Missing"}</strong>
          </li>
          <li>
            <span>deno</span>
            <strong>{status.denoInstalled ? "Installed" : "Missing"}</strong>
          </li>
        </ul>
      ) : null}
    </SectionCard>
  );
}
