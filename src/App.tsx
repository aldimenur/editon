import { useEffect } from "react";
import "./App.css";
import Navbar from "./components/Navbar";
import { ThemeProvider } from "./components/theme-provider";
import SfxPage from "./pages/sfx";
import useNavStore from "./stores/nav-store";
import TitleBar from "./components/title-bar";
import VideoPage from "./pages/video";
import { Progress } from "./components/ui/progress";
import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import ImagePage from "./pages/image";

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
  }
];

function App() {
  const { activeItem } = useNavStore((state) => state);

  const renderContent = () => {
    return router.find((route) => route.path === activeItem)?.element;
  };

  const [progress, setProgress] = useState<any>(null); // { current, total, filename }

  useEffect(() => {
    let unlistenFunction: any

    async function setupListener() {
      // Mendengarkan event 'waveform-progress' dari Rust
      unlistenFunction = await listen("waveform-progress", (event) => {
        const payload = event.payload as {
          current: number;
          total: number;
          filename: string;
          status: string;
        }

        setProgress(payload)

        if (payload.status === "done") {
          setProgress(null);
        }
      });

      unlistenFunction = await listen("thumbnail-progress", (event) => {
        const payload = event.payload as {
          current: number;
          total: number;
          filename: string;
          status: string;
        }

        setProgress(payload)

        if (payload.status === "done") {
          setProgress(null);
        }
      });
    }

    setupListener();

    // Cleanup saat komponen didestroy
    return () => {
      if (unlistenFunction) unlistenFunction();
    };
  }, [])

  const progressPercentage = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="bg-background text-foreground w-screen h-screen flex">
        <Navbar />
        <main className="flex-1 max-h-screen overflow-y-hidden">
          <TitleBar />
          {renderContent()}
          {/* Compact Floating Progress - Bottom Right */}
          {progress && (
            <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300">
              <div className="bg-card border rounded-lg shadow-lg p-3 w-80 space-y-2">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold">Optimizing Assets...</h4>
                    <p className="text-xs text-muted-foreground truncate" title={progress.filename}>
                      {progress.filename}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-primary shrink-0">
                    {Math.round(progressPercentage)}%
                  </span>
                </div>

                {/* Progress Bar */}
                <Progress value={progressPercentage} className="h-1.5" />

                {/* Stats */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progress.current} / {progress.total} files</span>
                  {progress.status && progress.status !== "done" && (
                    <span className="flex items-center gap-1">
                      <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                      {progress.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
