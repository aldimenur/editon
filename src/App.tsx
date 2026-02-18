import "./App.css";
import Sidebar from "./components/Sidebar";
import { ThemeProvider } from "./components/theme-provider";
import useNavStore from "./stores/nav-store";
import TitleBar from "./components/title-bar";
import YoutubeDownloadPage from "./pages/youtube-download";
import { useEffect, useState } from "react";
import useAssetStore from "./stores/asset-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SettingsPage from "./pages/settings";
import { Button } from "./components/ui/button";
import AssetsPage from "./pages/assets";
import { startFolderWatcher } from "@/features/assets/api/folder-api";
import { useAppUpdater } from "@/features/app-updates/hooks/use-app-updater";

function App() {
  const { activePage, isZenMode, toggleZenMode, setIsZenMode } = useNavStore(
    (state) => state,
  );
  const { parentPath } = useAssetStore((state) => state);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const {
    appVersion,
    checkForUpdates,
    installUpdate,
    isCheckingUpdates,
    isInstallingUpdate,
    lastCheckedAt,
    updateAvailable,
  } = useAppUpdater();

  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    appWindow.isAlwaysOnTop().then(setIsAlwaysOnTop);
  }, [appWindow]);

  const renderContent = () => {
    switch (activePage) {
      case "assets":
        return <AssetsPage />;
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
    if (!parentPath) {
      return;
    }

    void startFolderWatcher(parentPath);
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
