import "./App.css";
import Navbar from "./components/Navbar";
import { ThemeProvider } from "./components/theme-provider";
import SfxPage from "./pages/sfx";
import useNavStore from "./stores/nav-store";
import TitleBar from "./components/title-bar";
import VideoPage from "./pages/video";
import ImagePage from "./pages/image";
import YoutubeDownloadPage from "./pages/youtube-download";
import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import useAssetStore from "./stores/asset-store";
import { check } from "@tauri-apps/plugin-updater";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { startWatcher } from "./lib/utils";


const router = [
  {
    path: "/sound",
    element: <SfxPage />,
  },
  {
    path: "/video",
    element: <VideoPage />,
  },
  {
    path: "/image",
    element: <ImagePage />,
  },
  {
    path: "/youtube-download",
    element: <YoutubeDownloadPage />,
  }
];

function App() {
  const { activeItem } = useNavStore((state) => state);
  const { parentPath } = useAssetStore((state) => state)
  const initialized = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState("Unknown");
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  const renderContent = () => {
    return router.find((route) => route.path === activeItem)?.element;
  };

  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    appWindow.isAlwaysOnTop().then(setIsAlwaysOnTop);
  }, [appWindow]);


  useEffect(() => {

    if (initialized.current) return;
    initialized.current = true;

    const getAppVersion = async () => {
      const version = await getVersion();
      setAppVersion(version);
    }
    const checkForUpdates = async () => {
      const updates = await check();
      if (updates) {
        setUpdateAvailable(true);
      }
    };

    startWatcher(parentPath)
    checkForUpdates();
    getAppVersion();
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="bg-background text-foreground w-screen h-screen flex">
        <Navbar update={{ updateAvailable, appVersion }} />
        <main className="flex-1 max-h-screen overflow-y-hidden">
          <TitleBar window={{ appWindow, isAlwaysOnTop, isMaximized, setIsAlwaysOnTop, setIsMaximized }} />
          {renderContent()}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
