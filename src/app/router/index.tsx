import { useMemo, useState } from "react";

import { BrowserPage } from "@/pages/browser-page";
import { JobsPage } from "@/pages/jobs-page";
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

  return (
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
  );
}
