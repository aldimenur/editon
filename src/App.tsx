import { useMemo, useState } from "react";

import { AssetsPanel } from "@/features/assets/components/assets-panel";
import { JobsPanel } from "@/features/jobs/components/jobs-panel";
import { SettingsPanel } from "@/features/settings/components/settings-panel";

type AppSection = "assets" | "jobs" | "settings";

const NAV_ITEMS: Array<{ id: AppSection; label: string; subtitle: string }> = [
  { id: "assets", label: "Assets", subtitle: "Query and browse" },
  { id: "jobs", label: "Jobs", subtitle: "Worker queue status" },
  { id: "settings", label: "Settings", subtitle: "Backend controls" },
];

export default function App() {
  const [section, setSection] = useState<AppSection>("assets");

  const content = useMemo(() => {
    if (section === "jobs") {
      return <JobsPanel />;
    }

    if (section === "settings") {
      return <SettingsPanel />;
    }

    return <AssetsPanel />;
  }, [section]);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="brand-kicker">Editon</p>
          <h1>V2 Console</h1>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${item.id === section ? "is-active" : ""}`}
              onClick={() => setSection(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.subtitle}</small>
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">{content}</section>
    </main>
  );
}
