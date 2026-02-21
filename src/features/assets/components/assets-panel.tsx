import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";

import {
  onScanProgress,
  queryAssets,
  startScan,
  stopScan,
  type AssetItem,
  type ScanProgress,
} from "@/features/backend/api/backend-api";
import { canUseTauri } from "@/shared/lib/tauri-client";
import { SectionCard } from "@/shared/ui/section-card";

function WaveformMini({ data }: { data: number[] | null }) {
  if (!data || data.length === 0) {
    return <span className="wave-placeholder">pending</span>;
  }

  const points = data.slice(0, 36);
  return (
    <div className="wave-mini" aria-label="waveform preview">
      {points.map((value, index) => (
        <span
          key={`${index}-${value}`}
          style={{ height: `${Math.max(8, Math.round(value * 26))}px` }}
        />
      ))}
    </div>
  );
}

function ThumbnailMini({ path, type }: { path: string | null; type: string }) {
  if (type !== "video") {
    return <span className="thumb-placeholder">-</span>;
  }

  if (!path) {
    return <span className="thumb-placeholder">pending</span>;
  }

  const src = canUseTauri() ? convertFileSrc(path) : path;

  return (
    <img className="thumb-mini" src={src} alt="thumbnail" loading="lazy" />
  );
}

export function AssetsPanel() {
  const pageSize = 40;
  const [rootPath, setRootPath] = useState("F:/");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [items, setItems] = useState<AssetItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAssets = (page = 1) => {
    setLoading(true);
    queryAssets({ page, limit: pageSize })
      .then((result) => {
        setItems(result.data);
        setCurrentPage(result.currentPage);
        setTotalPages(result.totalPages);
        setTotalItems(result.totalItems);
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "Failed to load assets",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to load backend data.");
      return;
    }

    refreshAssets(1);

    let unlisten: (() => void) | undefined;
    onScanProgress((payload) => {
      setScanProgress(payload);
      if (payload.status === "done" || payload.status === "cancelled") {
        setScanBusy(false);
        setScanId(null);
        refreshAssets(1);
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

  const handleStartScan = async () => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to start scan.");
      return;
    }
    if (!rootPath.trim()) {
      setError("Please provide a folder path.");
      return;
    }

    try {
      setScanBusy(true);
      setError(null);
      const startedScanId = await startScan(rootPath.trim());
      setScanId(startedScanId);
      setScanProgress({
        scanId: startedScanId,
        count: 0,
        lastFile: "",
        status: "processing",
      });
    } catch (reason) {
      setScanBusy(false);
      setError(
        reason instanceof Error ? reason.message : "Failed to start scan",
      );
    }
  };

  const handlePickFolder = async () => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to choose a folder.");
      return;
    }

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose asset folder",
      });

      if (typeof selected === "string" && selected.trim().length > 0) {
        setRootPath(selected);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to open folder picker",
      );
    }
  };

  const handleStopScan = async () => {
    try {
      await stopScan(scanId ?? undefined);
      setScanBusy(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to stop scan",
      );
    }
  };

  return (
    <SectionCard
      title="Assets"
      subtitle="Cursor query output from v2_assets_query"
      actions={
        <span className="pill">
          Page {currentPage}/{totalPages} - {totalItems} total
        </span>
      }
    >
      <div className="scan-controls">
        <label htmlFor="scan-path">Asset Folder</label>
        <div className="scan-row">
          <input
            id="scan-path"
            value={rootPath}
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="F:/Projects/Assets"
          />
          <button
            type="button"
            className="btn ghost"
            onClick={handlePickFolder}
            disabled={scanBusy}
          >
            Browse
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleStartScan}
            disabled={scanBusy}
          >
            Start Scan
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={handleStopScan}
            disabled={!scanBusy}
          >
            Stop
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => refreshAssets(currentPage)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {scanProgress ? (
        <p className="state">
          Scan {scanProgress.scanId}: {scanProgress.status} -{" "}
          {scanProgress.count} files
          {scanProgress.lastFile ? ` (last: ${scanProgress.lastFile})` : ""}
        </p>
      ) : null}

      {loading ? <p className="state">Loading assets...</p> : null}
      {error ? <p className="state is-error">{error}</p> : null}
      {!loading && !error ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Thumbnail</th>
                <th>Waveform</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.filename}</td>
                  <td>{asset.typeName}</td>
                  <td>{Math.max(0, Math.round(asset.fileSize / 1024))} KB</td>
                  <td>
                    <ThumbnailMini
                      path={asset.thumbnailPath}
                      type={asset.typeName}
                    />
                  </td>
                  <td>
                    <WaveformMini data={asset.waveformData} />
                  </td>
                  <td>{asset.dateModified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="actions-row pagination-row">
          <button
            type="button"
            className="btn ghost"
            onClick={() => refreshAssets(1)}
            disabled={currentPage <= 1}
          >
            First
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => refreshAssets(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Prev
          </button>
          <span className="page-indicator">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => refreshAssets(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => refreshAssets(totalPages)}
            disabled={currentPage >= totalPages}
          >
            Last
          </button>
        </div>
      ) : null}
    </SectionCard>
  );
}
