import { useCallback, useEffect, useRef, useState } from "react";
import {
  Focus,
  Maximize2,
  Minus,
  Moon,
  Pin,
  PinOff,
  Sun,
  X,
} from "lucide-react";

import { onScanProgress } from "@/features/assets";
import { onJobUpdated } from "@/features/jobs/api/jobs-api";
import { BrowserPage } from "@/pages/browser-page";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { useTheme } from "@/shared/hooks/use-theme";
import { Button } from "@/shared/ui/button";

type ConsoleEntry = {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
};

export function AppRouter() {
  const { theme, toggleTheme } = useTheme();
  const [zenMode, setZenMode] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const consoleViewportRef = useRef<HTMLDivElement | null>(null);
  const lastConsoleEventRef = useRef<{ key: string; at: number } | null>(null);

  const appendConsole = useCallback(
    (level: ConsoleEntry["level"], message: string) => {
      const now = Date.now();
      const key = `${level}:${message}`;
      const lastEvent = lastConsoleEventRef.current;
      if (lastEvent && lastEvent.key === key && now - lastEvent.at < 1200) {
        return;
      }
      lastConsoleEventRef.current = { key, at: now };

      const timestamp = new Date().toLocaleTimeString();
      setConsoleEntries((current) => {
        const next = [
          ...current,
          {
            id: Date.now() + Math.floor(Math.random() * 1000),
            level,
            message: `${timestamp} ${message}`,
          },
        ];
        return next.slice(-160);
      });
    },
    [],
  );

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      const [topMost, maximized] = await Promise.all([
        appWindow.isAlwaysOnTop(),
        appWindow.isMaximized(),
      ]);

      if (disposed) {
        return;
      }

      setAlwaysOnTop(topMost);
      setIsMaximized(maximized);
    })();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (isTyping) {
        return;
      }

      if (event.key === "Escape" && zenMode) {
        setZenMode(false);
      }

      if (
        (event.key === "`" || event.code === "Backquote") &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        setIsConsoleOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [zenMode]);

  useEffect(() => {
    if (!isConsoleOpen || !consoleViewportRef.current) {
      return;
    }

    consoleViewportRef.current.scrollTop =
      consoleViewportRef.current.scrollHeight;
  }, [consoleEntries, isConsoleOpen]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | null = null;
    let disposed = false;
    onScanProgress((payload) => {
      appendConsole(
        payload.status.toLowerCase() === "failed" ? "error" : "info",
        `[scan:${payload.scanId}] ${payload.status} · ${payload.count} files${payload.lastFile ? ` · ${payload.lastFile}` : ""}`,
      );
    })
      .then((stop) => {
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
      })
      .catch(() => {
        if (disposed) {
          return;
        }
        appendConsole("error", "Failed to subscribe scan progress events.");
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, [appendConsole]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | null = null;
    let disposed = false;
    onJobUpdated((payload) => {
      const progressText =
        typeof payload.progress === "number" ? ` · ${payload.progress}%` : "";
      appendConsole(
        payload.status === "failed" ? "error" : "info",
        `[job:${payload.id}] ${payload.jobType} · ${payload.status}${progressText}${payload.message ? ` · ${payload.message}` : ""}`,
      );
    })
      .then((stop) => {
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
      })
      .catch(() => {
        if (disposed) {
          return;
        }
        appendConsole("error", "Failed to subscribe job updates.");
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, [appendConsole]);

  const toggleAlwaysOnTop = () => {
    if (!isTauriRuntime()) {
      return;
    }

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      const next = !alwaysOnTop;
      await appWindow.setAlwaysOnTop(next);
      setAlwaysOnTop(next);
    })();
  };

  const minimizeWindow = () => {
    if (!isTauriRuntime()) {
      return;
    }

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    })();
  };

  const toggleMaximizeWindow = () => {
    if (!isTauriRuntime()) {
      return;
    }

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      const maximized = await appWindow.isMaximized();

      if (maximized) {
        await appWindow.unmaximize();
        setIsMaximized(false);
        return;
      }

      await appWindow.maximize();
      setIsMaximized(true);
    })();
  };

  const closeWindow = () => {
    if (!isTauriRuntime()) {
      return;
    }

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    })();
  };

  return (
    <div className={`window-layout ${zenMode ? "is-zen-mode" : ""}`}>
      {!zenMode ? (
        <header className="window-topbar">
          <div className="window-topbar-left">
            <button
              type="button"
              className="window-btn zen-btn"
              onClick={() => setZenMode(true)}
              aria-label="Enable zen mode"
              title="Zen mode"
            >
              <Focus size={14} aria-hidden="true" />
            </button>
            <p className="topbar-title" data-tauri-drag-region>
              Editon
            </p>
          </div>
          <div className="window-drag-area" data-tauri-drag-region />
          <div className="window-topbar-right window-control-group">
            <button
              type="button"
              className={`window-btn ${theme === "dark" ? "is-active" : ""}`}
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? (
                <Sun size={14} aria-hidden="true" />
              ) : (
                <Moon size={14} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className={`window-btn ${alwaysOnTop ? "is-active" : ""}`}
              onClick={toggleAlwaysOnTop}
              aria-label="Toggle always on top"
              title={
                alwaysOnTop ? "Disable always on top" : "Enable always on top"
              }
            >
              {alwaysOnTop ? (
                <PinOff size={14} aria-hidden="true" />
              ) : (
                <Pin size={14} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="window-btn"
              onClick={minimizeWindow}
              aria-label="Minimize"
              title="Minimize"
            >
              <Minus size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="window-btn"
              onClick={toggleMaximizeWindow}
              aria-label={isMaximized ? "Restore" : "Maximize"}
              title={isMaximized ? "Restore" : "Maximize"}
            >
              <Maximize2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="window-btn is-danger"
              onClick={closeWindow}
              aria-label="Close"
              title="Close"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
      ) : (
        <button
          type="button"
          className="window-btn zen-float-btn"
          onClick={() => setZenMode(false)}
          aria-label="Exit zen mode"
          title="Exit zen mode (Esc)"
        >
          <Focus size={14} aria-hidden="true" />
          Exit
        </button>
      )}

      <main className="app-shell">
        <BrowserPage />
      </main>
      {isConsoleOpen ? (
        <section
          className="debug-console debug-console-overlay"
          aria-label="Process debug console"
        >
          <div className="debug-console-head">
            <strong>Console</strong>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConsoleEntries([])}
            >
              Clear
            </Button>
          </div>
          <div className="debug-console-viewport" ref={consoleViewportRef}>
            {consoleEntries.length === 0 ? (
              <p className="debug-console-line is-muted">
                Listening for scan and job events...
              </p>
            ) : (
              consoleEntries.map((entry) => (
                <p
                  key={entry.id}
                  className={`debug-console-line level-${entry.level}`}
                >
                  {entry.message}
                </p>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
