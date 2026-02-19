import "./App.css";
import Sidebar from "./components/Sidebar";
import { ThemeProvider } from "./components/theme-provider";
import useNavStore from "./stores/nav-store";
import TitleBar from "./components/title-bar";
import YoutubeDownloadPage from "./pages/youtube-download";
import { useEffect, useState } from "react";
import useAssetStore from "./stores/asset-store";
import type { Window } from "@tauri-apps/api/window";
import SettingsPage from "./pages/settings";
import { Button } from "./components/ui/button";
import AssetsPage from "./pages/assets";
import { startFolderWatcher } from "@/features/assets/api/folder-api";
import { useAppUpdater } from "@/features/app-updates/hooks/use-app-updater";
import { isTauriRuntime } from "@/lib/runtime";

function App() {
  const { activePage, isZenMode, toggleZenMode, setIsZenMode } = useNavStore(
    (state) => state,
  );
  const { parentPath } = useAssetStore((state) => state);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [appWindow, setAppWindow] = useState<Window | null>(null);
  const {
    appVersion,
    checkForUpdates,
    installUpdate,
    isCheckingUpdates,
    isInstallingUpdate,
    lastError,
    lastCheckedAt,
    status,
    updateAvailable,
  } = useAppUpdater();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();

        if (!isMounted) {
          return;
        }

        setAppWindow(currentWindow);

        const [maximized, alwaysOnTop] = await Promise.all([
          currentWindow.isMaximized(),
          currentWindow.isAlwaysOnTop(),
        ]);

        if (!isMounted) {
          return;
        }

        setIsMaximized(maximized);
        setIsAlwaysOnTop(alwaysOnTop);
      } catch (error) {
        console.error("Failed to initialize app window state:", error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const renderContent = () => {
    switch (activePage) {
      case "assets":
        if (!isTauriRuntime()) {
          return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Assets unavailable in browser QA
            </div>
          );
        }
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
              lastError,
              status,
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
    if (!isTauriRuntime() || !parentPath) {
      return;
    }

    void startFolderWatcher(parentPath);
  }, [parentPath]);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div
        className="bg-background text-foreground w-screen h-screen flex"
        data-testid="app-shell"
      >
        {!isZenMode && <Sidebar />}
        <main
          className="relative flex-1 max-h-screen overflow-hidden"
          data-testid="page-content"
        >
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
