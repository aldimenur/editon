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

    void checkDependencies();
    void checkForAppUpdate(false);
  }, [checkDependencies, checkForAppUpdate]);

  return (
    <section className="page-shell">
      {error ? <StatusText text={error} isError /> : null}
      <section className="pane settings-update-pane">
        <header className="pane-head">
          <h2>App Updates</h2>
          <div className="row-actions settings-update-actions">
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
        {updateVersion ? (
          <p className="meta">Latest found: v{updateVersion}</p>
        ) : null}
        {updatePhase === "downloading" ? (
          <div className="settings-update-progress">
            <Progress
              indeterminate={typeof updateProgress !== "number"}
              value={updateProgress ?? undefined}
            />
            <p className="status">Downloading {updateProgress ?? 0}%</p>
          </div>
        ) : null}
        <StatusText text={updateStatusText} isError={updatePhase === "error"} />
      </section>
      <SystemPanel
        dependencies={dependencies}
        loading={loading || !isTauriRuntime()}
        statusMessage={statusMessage}
        onCheck={() => void checkDependencies()}
        onInstall={() => void queueInstall()}
        onUpdate={() => void queueUpdate()}
      />
    </section>
  );
}
