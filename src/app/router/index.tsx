import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import type { ScanProgress } from "@/features/assets/api/assets-api";
import { onJobUpdated, type JobEvent } from "@/features/jobs/api/jobs-api";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { useTheme } from "@/shared/hooks/use-theme";
import { Button } from "@/shared/ui/button";
import { StatusText } from "@/shared/ui/status-text";

type AppView = "browser" | "youtube" | "settings";

type ConsoleEntry = {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
};

type FloatingProgressItem = { key: string; text: string; progress?: number };

const BrowserPage = lazy(() =>
  import("@/pages/browser-page").then((module) => ({
    default: module.BrowserPage,
  })),
);

const YoutubePage = lazy(() =>
  import("@/pages/youtube-page").then((module) => ({
    default: module.YoutubePage,
  })),
);

const SystemPage = lazy(() =>
  import("@/pages/system-page").then((module) => ({
    default: module.SystemPage,
  })),
);

function isTerminalStatus(status: string): boolean {
  const lowered = status.toLowerCase();
  return lowered === "done" || lowered === "failed" || lowered === "cancelled";
}

function isActiveProgressStatus(status: string): boolean {
  return status.toLowerCase() === "running";
}

function normalizeProgress(
  value: number | null | undefined,
): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }

  return value;
}

function formatScanProgressText(scanProgress: ScanProgress): string {
  return `${scanProgress.scanId} · ${scanProgress.status} · ${scanProgress.count} files${scanProgress.lastFile ? ` · ${scanProgress.lastFile}` : ""}`;
}

function formatPreviewJobText(jobEvent: JobEvent): string {
  return `job:${jobEvent.id} · ${jobEvent.jobType} · ${jobEvent.status}${typeof jobEvent.progress === "number" ? ` · ${jobEvent.progress}%` : ""}${jobEvent.message ? ` · ${jobEvent.message}` : ""}`;
}

function formatTrimJobText(jobEvent: JobEvent): string {
  return `trim:${jobEvent.id} · ${jobEvent.status}${typeof jobEvent.progress === "number" ? ` · ${jobEvent.progress}%` : ""}${jobEvent.message ? ` · ${jobEvent.message}` : ""}`;
}

export function AppRouter() {
  const { theme, toggleTheme } = useTheme();
  const [activeView, setActiveView] = useState<AppView>("browser");
  const [zenMode, setZenMode] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [scanProgressEvent, setScanProgressEvent] =
    useState<ScanProgress | null>(null);
  const [previewJobEvent, setPreviewJobEvent] = useState<JobEvent | null>(null);
  const [trimJobEvent, setTrimJobEvent] = useState<JobEvent | null>(null);
  const [dependencyJobEvent, setDependencyJobEvent] = useState<JobEvent | null>(
    null,
  );
  const consoleViewportRef = useRef<HTMLDivElement | null>(null);
  const lastConsoleEventRef = useRef<{ key: string; at: number } | null>(null);
  const previewClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const trimClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dependencyClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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
      setScanProgressEvent(payload);
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

      const isPreviewJob =
        payload.jobType === "generate_waveform" ||
        payload.jobType === "generate_video_thumbnail";
      const isTrimJob = payload.jobType === "trim_media";
      const isDependencyJob =
        payload.jobType === "dependencies_install" ||
        payload.jobType === "dependencies_update";

      if (isPreviewJob) {
        if (previewClearTimerRef.current) {
          clearTimeout(previewClearTimerRef.current);
          previewClearTimerRef.current = null;
        }

        setPreviewJobEvent(payload);

        if (isTerminalStatus(payload.status)) {
          previewClearTimerRef.current = setTimeout(() => {
            previewClearTimerRef.current = null;
            setPreviewJobEvent(null);
          }, 1800);
        }
      }

      if (isTrimJob) {
        if (trimClearTimerRef.current) {
          clearTimeout(trimClearTimerRef.current);
          trimClearTimerRef.current = null;
        }

        setTrimJobEvent(payload);

        if (isTerminalStatus(payload.status)) {
          trimClearTimerRef.current = setTimeout(() => {
            trimClearTimerRef.current = null;
            setTrimJobEvent(null);
          }, 2200);
        }
      }

      if (isDependencyJob) {
        if (dependencyClearTimerRef.current) {
          clearTimeout(dependencyClearTimerRef.current);
          dependencyClearTimerRef.current = null;
        }

        setDependencyJobEvent(payload);

        if (isTerminalStatus(payload.status)) {
          dependencyClearTimerRef.current = setTimeout(() => {
            dependencyClearTimerRef.current = null;
            setDependencyJobEvent(null);
          }, 2600);
        }
      }
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
      if (previewClearTimerRef.current) {
        clearTimeout(previewClearTimerRef.current);
        previewClearTimerRef.current = null;
      }
      if (trimClearTimerRef.current) {
        clearTimeout(trimClearTimerRef.current);
        trimClearTimerRef.current = null;
      }
      if (dependencyClearTimerRef.current) {
        clearTimeout(dependencyClearTimerRef.current);
        dependencyClearTimerRef.current = null;
      }
    };
  }, [appendConsole]);

  const activeProgressItems = useMemo<FloatingProgressItem[]>(() => {
    const items: FloatingProgressItem[] = [];

    if (scanProgressEvent && !isTerminalStatus(scanProgressEvent.status)) {
      items.push({
        key: "scan",
        text: formatScanProgressText(scanProgressEvent),
      });
    }

    if (previewJobEvent && isActiveProgressStatus(previewJobEvent.status)) {
      items.push({
        key: "preview",
        text: formatPreviewJobText(previewJobEvent),
        progress: normalizeProgress(previewJobEvent.progress),
      });
    }

    if (trimJobEvent && isActiveProgressStatus(trimJobEvent.status)) {
      items.push({
        key: "trim",
        text: formatTrimJobText(trimJobEvent),
        progress: normalizeProgress(trimJobEvent.progress),
      });
    }

    return items;
  }, [previewJobEvent, scanProgressEvent, trimJobEvent]);

  const compactProgressTextByKey: Record<string, string> = {
    scan: "Scanning",
    preview: "Preview",
    trim: "Trimming",
  };

  const dependencyProgressValue =
    typeof dependencyJobEvent?.progress === "number"
      ? Math.max(0, Math.min(100, dependencyJobEvent.progress))
      : undefined;
  const dependencyProgressActive =
    !!dependencyJobEvent && !isTerminalStatus(dependencyJobEvent.status);
  const dependencyProgressStatus =
    dependencyJobEvent?.status.toLowerCase() ?? "idle";
  const dependencyProgressShellClass =
    dependencyProgressStatus === "done" ? "is-success" : "";
  const dependencyCompactLabel = dependencyProgressActive
    ? "Install"
    : dependencyProgressStatus === "queued"
      ? "Queued"
      : dependencyProgressStatus === "done"
        ? "Done"
        : dependencyProgressStatus === "failed"
          ? "Failed"
          : "Stopped";

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
            <div className="app-view-nav">
              <button
                type="button"
                className={`view-tab ${activeView === "browser" ? "is-active" : ""}`}
                onClick={() => setActiveView("browser")}
              >
                Assets
              </button>
              <button
                type="button"
                className={`view-tab ${activeView === "youtube" ? "is-active" : ""}`}
                onClick={() => setActiveView("youtube")}
              >
                YouTube
              </button>
              <button
                type="button"
                className={`view-tab ${activeView === "settings" ? "is-active" : ""}`}
                onClick={() => setActiveView("settings")}
              >
                Settings
              </button>
            </div>
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
        <Suspense
          fallback={
            <section className="page-shell settings-page">
              <StatusText text="Loading view..." />
            </section>
          }
        >
          {activeView === "browser" ? <BrowserPage /> : null}
          {activeView === "youtube" ? <YoutubePage /> : null}
          {activeView === "settings" ? <SystemPage /> : null}
        </Suspense>
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
      {activeProgressItems.length > 0 ? (
        <div className="explorer-progress-float" aria-live="polite">
          <div className="explorer-progress-card">
            {(() => {
              const primaryItem = activeProgressItems[0];
              if (!primaryItem) {
                return null;
              }

              const hasNumericProgress =
                typeof primaryItem.progress === "number";
              const compactText =
                compactProgressTextByKey[primaryItem.key] ?? "Working";

              return (
                <div
                  className="explorer-progress-inline"
                  title={primaryItem.text}
                >
                  <span
                    className="explorer-progress-spinner"
                    aria-hidden="true"
                  />
                  <p className="explorer-progress-compact-text">
                    {activeProgressItems.length > 1
                      ? `${activeProgressItems.length} jobs`
                      : compactText}
                  </p>
                  {hasNumericProgress ? (
                    <span className="explorer-progress-percent">
                      {Math.max(
                        0,
                        Math.min(100, Math.round(primaryItem.progress ?? 0)),
                      )}
                      %
                    </span>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
      {dependencyJobEvent ? (
        <section className="youtube-progress-float" aria-live="polite">
          <div
            className={`dependency-progress-mini ${dependencyProgressShellClass}`}
            title={dependencyJobEvent.message || "Dependencies install"}
          >
            <span
              className={`dependency-progress-spinner ${dependencyProgressActive ? "" : "is-paused"}`}
              aria-hidden="true"
            />
            <p className="dependency-progress-text">{dependencyCompactLabel}</p>
            {typeof dependencyProgressValue === "number" ? (
              <span className="dependency-progress-percent">
                {dependencyProgressValue}%
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
