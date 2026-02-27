import { useCallback, useEffect, useRef, useState } from "react";

import { SystemPanel, useSystemStore } from "@/features/system";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";
import { StatusText } from "@/shared/ui/status-text";

type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export function SystemPage() {
  const {
    dependencies,
    loading,
    statusMessage,
    error,
    checkDependencies,
    queueInstall,
    queueUpdate,
  } = useSystemStore();
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>("idle");
  const [appVersion, setAppVersion] = useState<string>("Desktop");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateStatusText, setUpdateStatusText] = useState<string>("Ready.");
  const updateRef = useRef<{
    version: string;
    downloadAndInstall: (onEvent?: (event: unknown) => void) => Promise<void>;
  } | null>(null);

  const checkForAppUpdate = useCallback(async (manual: boolean) => {
    if (!isTauriRuntime()) {
      return;
    }

    setUpdatePhase("checking");
    setUpdateProgress(null);
    setUpdateStatusText(manual ? "Checking for updates..." : "Ready.");

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        updateRef.current = null;
        setUpdateVersion(null);
        setUpdatePhase("idle");
        setUpdateStatusText(
          manual ? "You already have the latest version." : "Ready.",
        );
        return;
      }

      updateRef.current = {
        version: update.version,
        downloadAndInstall: update.downloadAndInstall.bind(update),
      };
      setUpdateVersion(update.version);
      setUpdatePhase("available");
      setUpdateStatusText(`Update ${update.version} is available.`);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Failed to check updates";
      setUpdatePhase("error");
      setUpdateStatusText(message);
    }
  }, []);

  const installAppUpdate = useCallback(async () => {
    if (!isTauriRuntime()) {
      return;
    }

    const update = updateRef.current;
    if (!update) {
      await checkForAppUpdate(true);
      return;
    }

    setUpdatePhase("downloading");
    setUpdateProgress(0);
    setUpdateStatusText(`Downloading update ${update.version}...`);

    try {
      let downloaded = 0;
      let totalBytes = 0;
      await update.downloadAndInstall((event: unknown) => {
        if (!event || typeof event !== "object") {
          return;
        }
        const typed = event as {
          event?: string;
          data?: { contentLength?: number; chunkLength?: number };
        };

        if (typed.event === "Started") {
          totalBytes = typed.data?.contentLength ?? 0;
          setUpdateProgress(0);
          return;
        }

        if (typed.event === "Progress") {
          downloaded += typed.data?.chunkLength ?? 0;
          if (totalBytes > 0) {
            const percent = Math.max(
              0,
              Math.min(100, Math.round((downloaded / totalBytes) * 100)),
            );
            setUpdateProgress(percent);
          }
          return;
        }

        if (typed.event === "Finished") {
          setUpdateProgress(100);
        }
      });

      updateRef.current = null;
      setUpdatePhase("ready");
      setUpdateStatusText(
        "Update installed. Restart the app to apply the new version.",
      );
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Failed to install update";
      setUpdatePhase("error");
      setUpdateStatusText(message);
    }
  }, [checkForAppUpdate]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/plugin-app");
        const version = await getVersion();
        if (!disposed) {
          setAppVersion(version);
        }
      } catch {
        if (!disposed) {
          setAppVersion("Desktop");
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void checkDependencies();
    void checkForAppUpdate(false);
  }, [checkDependencies, checkForAppUpdate]);

  const updatePhaseLabel: Record<UpdatePhase, string> = {
    idle: "Ready",
    checking: "Checking",
    available: "Available",
    downloading: "Downloading",
    ready: "Installed",
    error: "Error",
  };

  return (
    <section className="page-shell settings-page">
      {error ? <StatusText text={error} isError /> : null}
      <header className="settings-page-header">
        <div>
          <p className="settings-kicker">System Preferences</p>
          <h1>Settings</h1>
          <p className="settings-subtitle">
            Manage app updates and runtime dependencies.
          </p>
        </div>
        <span className="settings-version-badge">v{appVersion}</span>
      </header>
      <section className="pane settings-card settings-updates-card">
        <header className="settings-card-head">
          <div className="settings-card-heading">
            <p className="settings-card-kicker">Application</p>
            <h2>Updates</h2>
            <p className="settings-card-note">
              Keep Editon secure and up to date with the latest release.
            </p>
          </div>
          <div className="row-actions settings-card-actions">
            <Button
              type="button"
              onClick={() => void checkForAppUpdate(true)}
              disabled={
                updatePhase === "checking" || updatePhase === "downloading"
              }
            >
              Check
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void installAppUpdate()}
              disabled={updatePhase !== "available"}
            >
              Install
            </Button>
          </div>
        </header>
        <div className="settings-update-meta">
          <span className={`settings-pill settings-pill-${updatePhase}`}>
            {updatePhaseLabel[updatePhase]}
          </span>
          <p className="meta settings-meta">
            {updateVersion
              ? `Latest found: v${updateVersion}`
              : "No pending version detected."}
          </p>
        </div>
        {updatePhase === "downloading" ? (
          <div className="settings-update-progress-card">
            <Progress
              indeterminate={typeof updateProgress !== "number"}
              value={updateProgress ?? undefined}
            />
            <p className="status">Downloading {updateProgress ?? 0}%</p>
          </div>
        ) : null}
        <div className="settings-status-wrap">
          <StatusText text={updateStatusText} isError={updatePhase === "error"} />
        </div>
      </section>
    </section>
  );
}
