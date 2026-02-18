import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";

type AppUpdaterState = {
  updateAvailable: boolean;
  appVersion: string;
  lastCheckedAt: string | null;
  isCheckingUpdates: boolean;
  isInstallingUpdate: boolean;
};

type AppUpdaterActions = {
  checkForUpdates: () => Promise<boolean>;
  installUpdate: () => Promise<void>;
};

export function useAppUpdater(): AppUpdaterState & AppUpdaterActions {
  const initialized = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState("Unknown");
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const update = await check();
      const hasUpdate = Boolean(update);

      setUpdateAvailable(hasUpdate);
      setLastCheckedAt(new Date().toISOString());

      return hasUpdate;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      return false;
    } finally {
      setIsCheckingUpdates(false);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setIsInstallingUpdate(true);
    try {
      const update = await check();

      if (!update) {
        setUpdateAvailable(false);
        return;
      }

      await update.download();
      await update.install();
      window.location.reload();
    } catch (error) {
      console.error("Failed to install update:", error);
    } finally {
      setIsInstallingUpdate(false);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    initialized.current = true;

    void checkForUpdates();

    void getVersion()
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
    updateAvailable,
  };
}
