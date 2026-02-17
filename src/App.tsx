import "./App.css";
import Sidebar from "./components/Sidebar";
import { ThemeProvider } from "./components/theme-provider";
import SfxPage from "./pages/sfx";
import useNavStore from "./stores/nav-store";
import TitleBar from "./components/title-bar";
import VideoPage from "./pages/video";
import ImagePage from "./pages/image";
import YoutubeDownloadPage from "./pages/youtube-download";
import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import useAssetStore from "./stores/asset-store";
import { check } from "@tauri-apps/plugin-updater";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { startWatcher } from "./lib/utils";
import SettingsPage from "./pages/settings";
import { Button } from "./components/ui/button";

function App() {
  const { activeItem, isZenMode, toggleZenMode, setIsZenMode } = useNavStore(
    (state) => state,
  );
  const { parentPath } = useAssetStore((state) => state);
  const initialized = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState("Unknown");
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    appWindow.isAlwaysOnTop().then(setIsAlwaysOnTop);
  }, [appWindow]);

  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const updates = await check();
      const hasUpdate = !!updates;
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
      if (update) {
        await update.download();
        await update.install();
        window.location.reload();
      } else {
        setUpdateAvailable(false);
      }
    } catch (error) {
      console.error("Failed to install update:", error);
    } finally {
      setIsInstallingUpdate(false);
    }
  }, []);

  const renderContent = () => {
    switch (activeItem) {
      case "/sound":
        return <SfxPage />;
      case "/video":
        return <VideoPage />;
      case "/image":
        return <ImagePage />;
      case "/youtube-download":
        return <YoutubeDownloadPage />;
      case "/settings":
        return (
          <SettingsPage
            update={{
              updateAvailable,
              appVersion,
              lastCheckedAt,
              isCheckingUpdates,
              isInstallingUpdate,
            }}
            onCheckForUpdates={checkForUpdates}
            onInstallUpdate={installUpdate}
          />
        );
      default:
        return null;
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const getAppVersion = async () => {
      const version = await getVersion();
      setAppVersion(version);
    };

    checkForUpdates();
    getAppVersion();
  }, []);

  useEffect(() => {
    if (!parentPath) {
      return;
    }

    void startWatcher(parentPath);
  }, [parentPath]);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="bg-background text-foreground w-screen h-screen flex">
        {!isZenMode && <Sidebar />}
        <main className="flex-1 max-h-screen overflow-y-hidden relative">
          {!isZenMode && (
            <TitleBar
              window={{
                appWindow,
                isAlwaysOnTop,
                isMaximized,
                setIsAlwaysOnTop,
                setIsMaximized,
              }}
              isZenMode={isZenMode}
              onToggleZen={toggleZenMode}
            />
          )}
          {isZenMode && (
            <div className="absolute top-1 left-1 z-50">
              <Button
                onClick={() => setIsZenMode(false)}
                size="xs"
                title="Exit Zen"
                variant="destructive"
              >
                Exit Zen
              </Button>
            </div>
          )}
          {renderContent()}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
