import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Eye,
  FolderPlus,
  Image as ImageIcon,
  Music2,
  Play,
  RefreshCw,
  Scissors,
  Search,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AssetPagination,
  onScanProgress,
  useAssetsStore,
} from "@/features/assets";
import type { ScanRoot } from "@/features/assets/api/assets-api";
import { formatDate } from "@/shared/lib/format/date";
import { formatFileSize } from "@/shared/lib/format/file-size";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { StatusText } from "@/shared/ui/status-text";

type AssetKind = "all" | "audio" | "video" | "image";

type TrimState = {
  inPoint: number;
  outPoint: number;
};

function classifyAsset(typeName: string): Exclude<AssetKind, "all"> {
  const lowered = typeName.toLowerCase();
  if (lowered.includes("video")) {
    return "video";
  }
  if (lowered.includes("audio") || lowered.includes("sound")) {
    return "audio";
  }
  return "image";
}

function toFileSrc(path: string | null): string | null {
  if (!path) {
    return null;
  }
  return isTauriRuntime() ? convertFileSrc(path) : path;
}

function fuzzyMatch(value: string, query: string): boolean {
  const target = value.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) {
    return true;
  }
  if (target.includes(needle)) {
    return true;
  }
  let cursor = 0;
  for (const char of needle) {
    cursor = target.indexOf(char, cursor);
    if (cursor === -1) {
      return false;
    }
    cursor += 1;
  }
  return true;
}

function Waveform({ data }: { data: number[] | null }) {
  if (!data || data.length === 0) {
    return (
      <div className="explore-wave-empty">
        <Music2 size={20} aria-hidden="true" />
        <span>Waveform pending</span>
      </div>
    );
  }

  const points = data.slice(0, 120);
  const max = Math.max(...points.map((item) => Math.abs(item)), 1);
  const lastIndex = Math.max(points.length - 1, 1);
  const polyline = points
    .map((point, index) => {
      const x = (index / lastIndex) * 100;
      const y = 50 - (point / max) * 42;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="explore-wave"
      viewBox="0 0 100 50"
      preserveAspectRatio="none"
    >
      <polyline points={polyline} />
    </svg>
  );
}

function RootItem({
  root,
  loading,
  syncingRootPath,
  removingRootPath,
  onSync,
  onRemove,
}: {
  root: ScanRoot;
  loading: boolean;
  syncingRootPath: string | null;
  removingRootPath: string | null;
  onSync: (rootPath: string) => void;
  onRemove: (rootPath: string) => void;
}) {
  const isSyncing = syncingRootPath === root.rootPath;
  const isRemoving = removingRootPath === root.rootPath;

  return (
    <article className="root-item">
      <p className="root-item-path" title={root.rootPath}>
        {root.rootPath}
      </p>
      <p className="root-item-meta">
        {root.dateLastScanned
          ? `Last sync ${formatDate(root.dateLastScanned)}`
          : `Added ${formatDate(root.dateAdded)}`}
      </p>
      <div className="root-item-actions">
        <button
          type="button"
          className="button button-ghost"
          disabled={loading || isSyncing || isRemoving}
          onClick={() => onSync(root.rootPath)}
        >
          {isSyncing ? "Syncing..." : "Sync"}
        </button>
        <button
          type="button"
          className="button button-ghost"
          disabled={loading || isSyncing || isRemoving}
          onClick={() => onRemove(root.rootPath)}
        >
          {isRemoving ? "Removing..." : "Remove"}
        </button>
      </div>
    </article>
  );
}

export function BrowserPage() {
  const {
    items,
    page,
    totalPages,
    totalItems,
    rootPath,
    scanId,
    scanProgress,
    scanRoots,
    syncingRootPath,
    removingRootPath,
    loading,
    error,
    setRootPath,
    setScanProgress,
    setError,
    refresh,
    refreshScanRoots,
    beginScan,
    syncRoot,
    removeRoot,
    haltScan,
  } = useAssetsStore();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetKind>("all");
  const [previewAssetId, setPreviewAssetId] = useState<number | null>(null);
  const [trimAssetId, setTrimAssetId] = useState<number | null>(null);
  const [trimByAssetId, setTrimByAssetId] = useState<Record<number, TrimState>>(
    {},
  );

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void refresh(1);
    void refreshScanRoots();

    let unlisten: (() => void) | undefined;
    onScanProgress((payload) => {
      setScanProgress(payload);
      if (payload.status === "done" || payload.status === "cancelled") {
        void refresh(1);
        void refreshScanRoots();
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
  }, [refresh, refreshScanRoots, setError, setScanProgress]);

  const visibleAssets = useMemo(() => {
    return items.filter((asset) => {
      const kind = classifyAsset(asset.typeName);
      if (typeFilter !== "all" && kind !== typeFilter) {
        return false;
      }
      const searchBlob = `${asset.filename} ${asset.originalPath} ${asset.tags.join(" ")}`;
      return fuzzyMatch(searchBlob, query);
    });
  }, [items, query, typeFilter]);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, asset) => {
        const kind = classifyAsset(asset.typeName);
        acc[kind] += 1;
        acc.all += 1;
        return acc;
      },
      { all: 0, audio: 0, video: 0, image: 0 },
    );
  }, [items]);

  const importRoot = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Import parent folder",
    });
    if (typeof selected === "string" && selected.trim().length > 0) {
      setRootPath(selected);
      void beginScan();
    }
  };

  const updateTrim = (assetId: number, partial: Partial<TrimState>) => {
    setTrimByAssetId((current) => {
      const base = current[assetId] ?? { inPoint: 0, outPoint: 100 };
      const merged = { ...base, ...partial };
      const boundedIn = Math.max(0, Math.min(99, merged.inPoint));
      const boundedOut = Math.min(100, Math.max(1, merged.outPoint));
      return {
        ...current,
        [assetId]: {
          inPoint: Math.min(boundedIn, boundedOut - 1),
          outPoint: Math.max(boundedOut, boundedIn + 1),
        },
      };
    });
  };

  return (
    <section className="explore-shell">
      <header className="explore-header">
        <div>
          <p className="explore-kicker">Explore</p>
          <h2>Asset Gallery</h2>
          <p className="meta">
            {visibleAssets.length} visible · {totalItems} indexed · page {page}/
            {totalPages}
          </p>
        </div>
      </header>

      <section className="import-shell">
        <div className="import-controls">
          <input
            className="path-input"
            value={rootPath}
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="F:/Projects/Assets"
            aria-label="Parent folder path"
          />
          <button
            type="button"
            className="button button-ghost"
            disabled={loading || !isTauriRuntime()}
            onClick={() => void importRoot()}
          >
            <FolderPlus size={15} aria-hidden="true" />
            Import Folder
          </button>
          <button
            type="button"
            className="button"
            disabled={loading || !isTauriRuntime()}
            onClick={() => void beginScan()}
          >
            Scan Recursive
          </button>
          <button
            type="button"
            className="button button-ghost"
            disabled={!scanId || loading || !isTauriRuntime()}
            onClick={() => void haltScan()}
          >
            Stop
          </button>
          <button
            type="button"
            className="button button-ghost"
            disabled={loading || !isTauriRuntime()}
            onClick={() => void refresh(page)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Reload
          </button>
        </div>

        <div className="root-grid">
          {scanRoots.map((root) => (
            <RootItem
              key={root.rootPath}
              root={root}
              loading={loading}
              syncingRootPath={syncingRootPath}
              removingRootPath={removingRootPath}
              onSync={(rootPathValue) => void syncRoot(rootPathValue)}
              onRemove={(rootPathValue) => void removeRoot(rootPathValue)}
            />
          ))}
        </div>
      </section>

      <section className="search-shell">
        <label className="search-input" htmlFor="asset-search-input">
          <Search size={15} aria-hidden="true" />
          <input
            id="asset-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fuzzy search filename, path, tags"
          />
        </label>
        <div
          className="filter-row"
          role="tablist"
          aria-label="Asset type filter"
        >
          {(["all", "audio", "video", "image"] as AssetKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip ${typeFilter === kind ? "is-active" : ""}`}
              onClick={() => setTypeFilter(kind)}
            >
              {kind} ({counts[kind]})
            </button>
          ))}
        </div>
      </section>

      {scanProgress ? (
        <StatusText
          text={`scan ${scanProgress.scanId} · ${scanProgress.status} · ${scanProgress.count} files · ${scanProgress.lastFile}`}
        />
      ) : null}
      {error ? <StatusText text={error} isError /> : null}

      <section className="gallery-scroll">
        <div className="gallery-masonry">
          {visibleAssets.map((asset) => {
            const kind = classifyAsset(asset.typeName);
            const thumbSrc = toFileSrc(asset.thumbnailPath);
            const sourceSrc = toFileSrc(asset.originalPath);
            const isPreviewOpen = previewAssetId === asset.id;
            const isTrimOpen = trimAssetId === asset.id;
            const trimState = trimByAssetId[asset.id] ?? {
              inPoint: 0,
              outPoint: 100,
            };

            return (
              <article key={asset.id} className="gallery-card">
                <div className="gallery-card-media">
                  {kind === "audio" ? (
                    <Waveform data={asset.waveformData} />
                  ) : thumbSrc ? (
                    <img src={thumbSrc} alt={asset.filename} loading="lazy" />
                  ) : (
                    <div className="explore-wave-empty">
                      {kind === "video" ? (
                        <Video size={20} aria-hidden="true" />
                      ) : (
                        <ImageIcon size={20} aria-hidden="true" />
                      )}
                      <span>Thumbnail pending</span>
                    </div>
                  )}
                </div>

                <div className="gallery-card-body">
                  <div className="gallery-title-row">
                    <h3 title={asset.filename}>{asset.filename}</h3>
                    <span className="gallery-kind">{kind}</span>
                  </div>
                  <p className="gallery-path" title={asset.originalPath}>
                    {asset.originalPath}
                  </p>
                  <p className="gallery-meta">
                    {formatFileSize(asset.fileSize)} ·{" "}
                    {formatDate(asset.dateModified)}
                  </p>

                  {asset.tags.length > 0 ? (
                    <div className="gallery-tags">
                      {asset.tags.slice(0, 4).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  ) : null}

                  <div className="gallery-actions">
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() =>
                        setPreviewAssetId((current) =>
                          current === asset.id ? null : asset.id,
                        )
                      }
                    >
                      <Eye size={14} aria-hidden="true" />
                      Preview
                    </button>
                    {(kind === "audio" || kind === "video") && sourceSrc ? (
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => setPreviewAssetId(asset.id)}
                      >
                        <Play size={14} aria-hidden="true" />
                        Play
                      </button>
                    ) : null}
                    {(kind === "audio" || kind === "video") && sourceSrc ? (
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() =>
                          setTrimAssetId((current) =>
                            current === asset.id ? null : asset.id,
                          )
                        }
                      >
                        <Scissors size={14} aria-hidden="true" />
                        Trim
                      </button>
                    ) : null}
                  </div>

                  {isPreviewOpen && sourceSrc ? (
                    <div className="gallery-preview-inline">
                      {kind === "audio" ? (
                        <audio controls preload="metadata" src={sourceSrc} />
                      ) : null}
                      {kind === "video" ? (
                        <video
                          controls
                          preload="metadata"
                          src={sourceSrc}
                          poster={thumbSrc ?? undefined}
                        />
                      ) : null}
                      {kind === "image" ? (
                        <img
                          src={sourceSrc}
                          alt={asset.filename}
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {isTrimOpen ? (
                    <div className="gallery-trim-inline">
                      <div className="gallery-trim-head">
                        <strong>
                          In {trimState.inPoint}% · Out {trimState.outPoint}%
                        </strong>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => setTrimAssetId(null)}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                      <label>
                        In-point
                        <input
                          type="range"
                          min={0}
                          max={99}
                          value={trimState.inPoint}
                          onChange={(event) =>
                            updateTrim(asset.id, {
                              inPoint: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Out-point
                        <input
                          type="range"
                          min={1}
                          max={100}
                          value={trimState.outPoint}
                          onChange={(event) =>
                            updateTrim(asset.id, {
                              outPoint: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <AssetPagination
        page={page}
        totalPages={totalPages}
        loading={loading}
        onFirst={() => void refresh(1)}
        onPrev={() => void refresh(page - 1)}
        onNext={() => void refresh(page + 1)}
        onLast={() => void refresh(totalPages)}
      />
    </section>
  );
}
