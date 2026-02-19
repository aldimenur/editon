import { useCallback, useEffect, useRef, useState } from "react";

import { getQaFlag, isBrowserQaMode, isTauriRuntime } from "@/lib/runtime";

export type AppUpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "installing"
  | "error";

type AppUpdaterState = {
  updateAvailable: boolean;
  appVersion: string;
  lastCheckedAt: string | null;
  isCheckingUpdates: boolean;
  isInstallingUpdate: boolean;
  status: AppUpdaterStatus;
  lastError: string | null;
};

type AppUpdaterActions = {
  checkForUpdates: () => Promise<boolean>;
  installUpdate: () => Promise<void>;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function useAppUpdater(): AppUpdaterState & AppUpdaterActions {
  const initialized = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState("Unknown");
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [status, setStatus] = useState<AppUpdaterStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    setStatus("checking");
    setLastError(null);

    if (!isTauriRuntime()) {
      if (!isBrowserQaMode()) {
        setIsCheckingUpdates(false);
        setStatus("up-to-date");
        return false;
      }

      await wait(500);

      const mode = getQaFlag("update");
      if (mode === "error") {
        setUpdateAvailable(false);
        setLastCheckedAt(new Date().toISOString());
        setLastError("Update check unavailable in browser mode.");
        setStatus("error");
        setIsCheckingUpdates(false);
        return false;
      }

      const hasUpdate = mode === "available";
      setUpdateAvailable(hasUpdate);
      setLastCheckedAt(new Date().toISOString());
      setStatus(hasUpdate ? "available" : "up-to-date");
      setIsCheckingUpdates(false);
      return hasUpdate;
    }

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      const hasUpdate = Boolean(update);

      setUpdateAvailable(hasUpdate);
      setLastCheckedAt(new Date().toISOString());
      setStatus(hasUpdate ? "available" : "up-to-date");

      return hasUpdate;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setLastError("Failed to check for updates.");
      setStatus("error");
      return false;
    } finally {
      setIsCheckingUpdates(false);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setLastError(null);
    setStatus("installing");
    setIsInstallingUpdate(true);

    if (!isTauriRuntime()) {
      if (!isBrowserQaMode()) {
        setIsInstallingUpdate(false);
        setStatus("error");
        setLastError("Update install is only available in the desktop app.");
        return;
      }

      await wait(800);
      setUpdateAvailable(false);
      setLastCheckedAt(new Date().toISOString());
      setStatus("up-to-date");
      setIsInstallingUpdate(false);
      return;
    }

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (!update) {
        setUpdateAvailable(false);
        setStatus("up-to-date");
        return;
      }

      await update.download();
      await update.install();
      window.location.reload();
    } catch (error) {
      console.error("Failed to install update:", error);
      setLastError("Failed to install update.");
      setStatus("error");
    } finally {
      setIsInstallingUpdate(false);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    initialized.current = true;

    if (!isTauriRuntime()) {
      setAppVersion(isBrowserQaMode() ? "QA Browser" : "Web");
      return;
    }

    void checkForUpdates();

    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((version) => {
        setAppVersion(version);
      })
      .catch((error) => {
        console.error("Failed to get app version:", error);
      });
  }, [checkForUpdates]);

  return {
    appVersion,
    checkForUpdates,
    installUpdate,
    isCheckingUpdates,
    isInstallingUpdate,
    lastCheckedAt,
    lastError,
    status,
    updateAvailable,
  };
}
