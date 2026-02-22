import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import {
  getDependenciesStatus,
  installDependencies,
  listJobs,
  onScanProgress,
  queryAssets,
  startScan,
  stopScan,
  type AssetItem,
  type DependencyStatus,
  type JobItem,
  type ScanProgress,
} from "@/lib/backend-api";
import { canUseTauri } from "@/lib/tauri-client";

type Theme = "light" | "dark";
type View = "browser" | "jobs" | "system";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "browser", label: "Browser" },
  { id: "jobs", label: "Jobs" },
  { id: "system", label: "System" },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetThumbnail({ asset }: { asset: AssetItem }) {
  if (asset.typeName !== "video") {
    return <span className="muted">-</span>;
  }

  if (!asset.thumbnailPath) {
    return <span className="muted">pending</span>;
  }

  const src = canUseTauri()
    ? convertFileSrc(asset.thumbnailPath)
    : asset.thumbnailPath;
  return (
    <img className="thumb" src={src} alt={asset.filename} loading="lazy" />
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>("light");
  const [view, setView] = useState<View>("browser");

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [dependencies, setDependencies] = useState<DependencyStatus | null>(
    null,
  );

  const [rootPath, setRootPath] = useState("F:/");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ready.");

  useEffect(() => {
    const stored = window.localStorage.getItem("editon-theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("editon-theme", theme);
  }, [theme]);

  const refreshAssets = async (targetPage = 1) => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to load assets.");
      return;
    }

    setBusy(true);
    try {
      const result = await queryAssets({ page: targetPage, limit: 40 });
      setAssets(result.data);
      setPage(result.currentPage);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to load assets",
      );
    } finally {
      setBusy(false);
    }
  };

  const refreshJobs = async () => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to load jobs.");
      return;
    }

    setBusy(true);
    try {
      const result = await listJobs();
      setJobs(result);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to load jobs",
      );
    } finally {
      setBusy(false);
    }
  };

  const refreshDependencies = async () => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to load system status.");
      return;
    }

    setBusy(true);
    try {
      const result = await getDependenciesStatus();
      setDependencies(result);
      setStatusMessage("System status updated.");
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to load system status",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshAssets(1);

    let unlisten: (() => void) | undefined;
    onScanProgress((payload) => {
      setScanProgress(payload);
      if (payload.status === "done" || payload.status === "cancelled") {
        setScanId(null);
        void refreshAssets(1);
      }
    })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {
        setError("Failed to subscribe scan progress events.");
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const openFolderPicker = async () => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to choose a folder.");
      return;
    }

    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose asset folder",
    });

    if (typeof selected === "string" && selected.trim().length > 0) {
      setRootPath(selected);
    }
  };

  const startAssetScan = async () => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to start scan.");
      return;
    }

    if (!rootPath.trim()) {
      setError("Root path is required.");
      return;
    }

    setBusy(true);
    try {
      const id = await startScan(rootPath.trim());
      setScanId(id);
      setScanProgress({
        scanId: id,
        count: 0,
        lastFile: "",
        status: "processing",
      });
      setStatusMessage("Scan started.");
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to start scan",
      );
    } finally {
      setBusy(false);
    }
  };

  const stopAssetScan = async () => {
    setBusy(true);
    try {
      await stopScan(scanId ?? undefined);
      setStatusMessage("Scan stop requested.");
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to stop scan",
      );
    } finally {
      setBusy(false);
    }
  };

  const queueDependencyInstall = async () => {
    setBusy(true);
    try {
      const message = await installDependencies();
      setStatusMessage(message);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to queue dependency install",
      );
    } finally {
      setBusy(false);
    }
  };

  const visibleBody = useMemo(() => {
    if (view === "jobs") {
      return (
        <section className="pane">
          <header className="pane-head">
            <h2>Queue Jobs</h2>
            <button
              type="button"
              className="button"
              onClick={() => void refreshJobs()}
              disabled={busy}
            >
              Refresh
            </button>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.id}</td>
                    <td>{job.jobType}</td>
                    <td>{job.status}</td>
                    <td>{job.priority}</td>
                    <td>{job.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (view === "system") {
      return (
        <section className="pane">
          <header className="pane-head">
            <h2>System</h2>
            <div className="row-actions">
              <button
                type="button"
                className="button"
                onClick={() => void refreshDependencies()}
                disabled={busy}
              >
                Check
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void queueDependencyInstall()}
                disabled={busy}
              >
                Install
              </button>
            </div>
          </header>
          <div className="kv-grid">
            <p>yt-dlp</p>
            <strong>
              {dependencies?.ytDlpInstalled ? "Installed" : "Missing"}
            </strong>
            <p>ffmpeg</p>
            <strong>
              {dependencies?.ffmpegInstalled ? "Installed" : "Missing"}
            </strong>
            <p>ffprobe</p>
            <strong>
              {dependencies?.ffprobeInstalled ? "Installed" : "Missing"}
            </strong>
            <p>deno</p>
            <strong>
              {dependencies?.denoInstalled ? "Installed" : "Missing"}
            </strong>
          </div>
          <p className="status">{statusMessage}</p>
        </section>
      );
    }

    return (
      <section className="pane">
        <header className="pane-head">
          <h2>Asset Browser</h2>
          <p className="meta">
            {totalItems} items · page {page}/{totalPages}
          </p>
        </header>
        <div className="toolbar">
          <input
            className="path-input"
            value={rootPath}
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="F:/Projects/Assets"
          />
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void openFolderPicker()}
            disabled={busy}
          >
            Browse
          </button>
          <button
            type="button"
            className="button"
            onClick={() => void startAssetScan()}
            disabled={busy}
          >
            Scan
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void stopAssetScan()}
            disabled={!scanId || busy}
          >
            Stop
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void refreshAssets(page)}
            disabled={busy}
          >
            Reload
          </button>
        </div>
        {scanProgress ? (
          <p className="status">
            scan {scanProgress.scanId} · {scanProgress.status} ·{" "}
            {scanProgress.count} files
          </p>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Preview</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.filename}</td>
                  <td>{asset.typeName}</td>
                  <td>{formatFileSize(asset.fileSize)}</td>
                  <td>
                    <AssetThumbnail asset={asset} />
                  </td>
                  <td>{asset.dateModified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="pager">
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void refreshAssets(1)}
            disabled={page <= 1 || busy}
          >
            First
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void refreshAssets(page - 1)}
            disabled={page <= 1 || busy}
          >
            Prev
          </button>
          <button
            type="button"
            className="button"
            onClick={() => void refreshAssets(page + 1)}
            disabled={page >= totalPages || busy}
          >
            Next
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void refreshAssets(totalPages)}
            disabled={page >= totalPages || busy}
          >
            Last
          </button>
        </footer>
      </section>
    );
  }, [
    assets,
    busy,
    dependencies,
    jobs,
    page,
    rootPath,
    scanId,
    scanProgress,
    statusMessage,
    totalItems,
    totalPages,
    view,
  ]);

  return (
    <main className="app-shell">
      <aside className="left-rail">
        <div>
          <p className="brand">Editon</p>
          <p className="brand-sub">Bridge Console</p>
        </div>
        <nav className="rail-nav">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-item ${item.id === view ? "is-active" : ""}`}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="rail-item"
          onClick={() =>
            setTheme((current) => (current === "light" ? "dark" : "light"))
          }
        >
          Theme: {theme}
        </button>
      </aside>
      <section className="content-frame">
        {error ? <p className="status status-error">{error}</p> : null}
        {visibleBody}
      </section>
    </main>
  );
}
