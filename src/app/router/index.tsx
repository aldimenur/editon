import { useEffect, useMemo, useState } from "react";
import { Focus, Maximize2, Minus, Pin, PinOff, X } from "lucide-react";

import { BrowserPage } from "@/pages/browser-page";
import { JobsPage } from "@/pages/jobs-page";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { SystemPage } from "@/pages/system-page";
import { useTheme } from "@/shared/hooks/use-theme";

type AppRoute = "browser" | "jobs" | "system";

const ROUTES: Array<{ id: AppRoute; label: string }> = [
  { id: "browser", label: "Browser" },
  { id: "jobs", label: "Jobs" },
  { id: "system", label: "System" },
];

export function AppRouter() {
  const [route, setRoute] = useState<AppRoute>("browser");
  const [zenMode, setZenMode] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const content = useMemo(() => {
    if (route === "jobs") {
      return <JobsPage />;
    }

    if (route === "system") {
      return <SystemPage />;
    }

    return <BrowserPage />;
  }, [route]);

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
      if (event.key === "Escape" && zenMode) {
        setZenMode(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [zenMode]);

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
        <aside className="left-rail">
          <div>
            <p className="brand">Editon</p>
            <p className="brand-sub">Bridge Console</p>
          </div>
          <nav className="rail-nav">
            {ROUTES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rail-item ${item.id === route ? "is-active" : ""}`}
                onClick={() => setRoute(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <button type="button" className="rail-item" onClick={toggleTheme}>
            Theme: {theme}
          </button>
        </aside>
        <section className="content-frame">{content}</section>
      </main>
    </div>
  );
}
