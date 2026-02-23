import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Compass,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Music2,
  RefreshCw,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { onScanProgress, useAssetsStore } from "@/features/assets";
import type {
  QueryAssetsInput,
  ScanRoot,
} from "@/features/assets/api/assets-api";
import { onJobUpdated, type JobEvent } from "@/features/jobs/api/jobs-api";
import { formatDate } from "@/shared/lib/format/date";
import { formatFileSize } from "@/shared/lib/format/file-size";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Progress } from "@/shared/ui/progress";
import { Slider } from "@/shared/ui/slider";
import { StatusText } from "@/shared/ui/status-text";

type AssetKind = "all" | "audio" | "video" | "image";

const ASSET_KIND_META: Record<
  AssetKind,
  { label: string; icon: typeof Compass }
> = {
  all: { label: "All assets", icon: Compass },
  audio: { label: "Audio assets", icon: Music2 },
  video: { label: "Video assets", icon: Video },
  image: { label: "Image assets", icon: ImageIcon },
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

function formatRootLabel(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, "/");
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? rootPath;
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
  active,
  loading,
  isScanning,
  syncingRootPath,
  removingRootPath,
  onSelect,
  onSync,
  onStop,
  onRemove,
}: {
  root: ScanRoot;
  active: boolean;
  loading: boolean;
  isScanning: boolean;
  syncingRootPath: string | null;
  removingRootPath: string | null;
  onSelect: (rootPath: string) => void;
  onSync: (rootPath: string) => void;
  onStop: () => void;
  onRemove: (rootPath: string) => void;
}) {
  const isSyncing = syncingRootPath === root.rootPath;
  const isRemoving = removingRootPath === root.rootPath;
  const canStop = active && isScanning;

  return (
    <article className={`root-item ${active ? "is-active" : ""}`}>
      <button
        type="button"
        className="root-item-select"
        onClick={() => onSelect(root.rootPath)}
        title={root.rootPath}
      >
        <span className="root-item-main">
          <Folder size={12} aria-hidden="true" />
          <span className="root-item-path">
            {formatRootLabel(root.rootPath)}
          </span>
        </span>
      </button>
      <div className="root-item-actions">
        {canStop ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={onStop}
            title="Stop scan"
            aria-label="Stop scan"
          >
            <X size={12} aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || isScanning || isSyncing || isRemoving}
            onClick={() => onSync(root.rootPath)}
            title={isSyncing ? "Syncing directory" : "Sync directory"}
            aria-label={isSyncing ? "Syncing directory" : "Sync directory"}
          >
            <RefreshCw size={12} aria-hidden="true" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading || isSyncing || isRemoving}
          onClick={() => onRemove(root.rootPath)}
          title={isRemoving ? "Removing directory" : "Remove directory"}
          aria-label={isRemoving ? "Removing directory" : "Remove directory"}
        >
          <Trash2 size={12} aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}

export function BrowserPage() {
  const {
    items,
    page,
    totalPages,
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
    loadMore,
    refreshScanRoots,
    beginScan,
    syncRoot,
    removeRoot,
    haltScan,
  } = useAssetsStore();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetKind>("all");
  const [galleryZoom, setGalleryZoom] = useState(100);
  const [selectedRootPath, setSelectedRootPath] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<number | null>(null);
  const [quicklookAssetId, setQuicklookAssetId] = useState<number | null>(null);
  const [previewJobEvent, setPreviewJobEvent] = useState<JobEvent | null>(null);
  const [assetAspectById, setAssetAspectById] = useState<
    Record<number, number>
  >({});
  const assetAspectByIdRef = useRef<Record<number, number>>({});
  const probingAssetIdsRef = useRef<Set<number>>(new Set());
  const aspectFlushFrameRef = useRef<number | null>(null);
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const previewJobClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const galleryScrollRef = useRef<HTMLDivElement | null>(null);
  const [galleryViewportWidth, setGalleryViewportWidth] = useState(0);

  const queryFilters = useMemo<QueryAssetsInput>(
    () => ({
      search: debouncedQuery,
      assetType: typeFilter === "all" ? undefined : typeFilter,
      rootPath: selectedRootPath ?? undefined,
    }),
    [debouncedQuery, selectedRootPath, typeFilter],
  );

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void refreshScanRoots();

    let unlisten: (() => void) | null = null;
    let disposed = false;
    onScanProgress((payload) => {
      const terminalStatuses = ["done", "cancelled", "failed"];
      if (terminalStatuses.includes(payload.status.toLowerCase())) {
        setScanProgress(payload);
        void refresh(1, queryFilters);
        void refreshScanRoots();
        return;
      }

      setScanProgress(payload);
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
        setError("Failed to subscribe scan progress events.");
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, [queryFilters, refresh, refreshScanRoots, setError, setScanProgress]);

  useEffect(() => {
    if (!scanProgress || scanProgress.status.toLowerCase() !== "processing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setScanProgress(null);
      setError(
        `Scan ${scanProgress.scanId} timed out waiting for progress updates. Please sync again.`,
      );
      void refresh(1, queryFilters);
      void refreshScanRoots();
    }, 20_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    queryFilters,
    refresh,
    refreshScanRoots,
    scanProgress,
    setError,
    setScanProgress,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const queuePreviewRefresh = () => {
      if (liveRefreshTimerRef.current) {
        return;
      }

      liveRefreshTimerRef.current = setTimeout(() => {
        liveRefreshTimerRef.current = null;
        void refresh(1, queryFilters);
      }, 220);
    };

    let unlisten: (() => void) | null = null;
    let disposed = false;
    onJobUpdated((payload) => {
      const previewJobs = ["generate_waveform", "generate_video_thumbnail"];
      if (!previewJobs.includes(payload.jobType)) {
        return;
      }

      if (previewJobClearTimerRef.current) {
        clearTimeout(previewJobClearTimerRef.current);
        previewJobClearTimerRef.current = null;
      }

      setPreviewJobEvent(payload);

      if (payload.status === "done") {
        queuePreviewRefresh();
      }

      if (
        payload.status === "done" ||
        payload.status === "failed" ||
        payload.status === "cancelled"
      ) {
        previewJobClearTimerRef.current = setTimeout(() => {
          previewJobClearTimerRef.current = null;
          setPreviewJobEvent(null);
        }, 1800);
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
        setError("Failed to subscribe preview updates.");
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      if (liveRefreshTimerRef.current) {
        clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
      if (previewJobClearTimerRef.current) {
        clearTimeout(previewJobClearTimerRef.current);
        previewJobClearTimerRef.current = null;
      }
    };
  }, [queryFilters, refresh, setError]);

  useEffect(() => {
    if (!selectedRootPath) {
      return;
    }

    const stillExists = scanRoots.some(
      (root) => root.rootPath === selectedRootPath,
    );
    if (!stillExists) {
      setSelectedRootPath(null);
    }
  }, [scanRoots, selectedRootPath]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    void refresh(1, queryFilters);
  }, [queryFilters, refresh]);

  const visibleAssets = useMemo(() => items, [items]);

  useEffect(() => {
    assetAspectByIdRef.current = assetAspectById;
  }, [assetAspectById]);

  useEffect(() => {
    let disposed = false;
    const pendingAspectUpdates: Record<number, number> = {};

    const flushAspectUpdates = () => {
      if (aspectFlushFrameRef.current !== null) {
        return;
      }

      aspectFlushFrameRef.current = window.requestAnimationFrame(() => {
        aspectFlushFrameRef.current = null;
        if (disposed) {
          return;
        }

        const entries = Object.entries(pendingAspectUpdates);
        if (entries.length === 0) {
          return;
        }

        setAssetAspectById((current) => {
          let changed = false;
          const next = { ...current };
          for (const [idText, ratio] of entries) {
            const id = Number(idText);
            if (!Number.isFinite(id) || next[id] === ratio) {
              continue;
            }
            next[id] = ratio;
            changed = true;
          }

          for (const key of Object.keys(pendingAspectUpdates)) {
            delete pendingAspectUpdates[Number(key)];
          }

          if (!changed) {
            return current;
          }

          assetAspectByIdRef.current = next;
          return next;
        });
      });
    };

    visibleAssets.forEach((asset) => {
      const knownAspects = assetAspectByIdRef.current;
      const kind = classifyAsset(asset.typeName);
      if (kind === "audio") {
        if (!knownAspects[asset.id]) {
          pendingAspectUpdates[asset.id] = 2.8;
          flushAspectUpdates();
        }
        return;
      }

      if (knownAspects[asset.id] || probingAssetIdsRef.current.has(asset.id)) {
        return;
      }

      const thumbSrc = toFileSrc(asset.thumbnailPath);
      const sourceSrc = toFileSrc(asset.originalPath);
      const imageSource = thumbSrc ?? (kind === "image" ? sourceSrc : null);

      if (!imageSource) {
        return;
      }

      probingAssetIdsRef.current.add(asset.id);
      const probe = new Image();
      probe.decoding = "async";
      probe.onerror = () => {
        probingAssetIdsRef.current.delete(asset.id);
      };
      probe.onload = () => {
        probingAssetIdsRef.current.delete(asset.id);
        if (disposed) {
          return;
        }

        const width = probe.naturalWidth;
        const height = probe.naturalHeight;
        if (!width || !height) {
          return;
        }

        const ratio = Math.max(0.45, Math.min(3.4, width / height));
        pendingAspectUpdates[asset.id] = ratio;
        flushAspectUpdates();
      };
      probe.src = imageSource;
    });

    return () => {
      disposed = true;
      if (aspectFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(aspectFlushFrameRef.current);
        aspectFlushFrameRef.current = null;
      }
    };
  }, [visibleAssets]);

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

  const quicklookAsset =
    quicklookAssetId === null
      ? null
      : (visibleAssets.find((asset) => asset.id === quicklookAssetId) ?? null);
  const galleryColumnWidth = Math.round(180 * (galleryZoom / 100));
  const galleryGap = 4;
  const galleryCardVerticalGap = 4;
  const galleryColumnCount = Math.max(
    1,
    Math.floor(
      (galleryViewportWidth + galleryGap) / (galleryColumnWidth + galleryGap),
    ),
  );
  const galleryCardWidth =
    galleryViewportWidth > 0
      ? Math.max(
          120,
          Math.floor(
            (galleryViewportWidth - (galleryColumnCount - 1) * galleryGap) /
              galleryColumnCount,
          ),
        )
      : galleryColumnWidth;
  const virtualOverscan = Math.max(6, galleryColumnCount * 2);
  const loadAheadItems = Math.max(galleryColumnCount * 4, 12);

  const estimateItemSize = (index: number) => {
    const asset = visibleAssets[index];
    if (!asset) {
      return 240;
    }

    const kind = classifyAsset(asset.typeName);
    const fallbackAspect =
      kind === "audio" ? 2.8 : kind === "video" ? 16 / 9 : 4 / 3;
    const aspect = assetAspectById[asset.id] ?? fallbackAspect;
    const mediaHeight =
      galleryCardWidth / Math.max(0.45, Math.min(3.4, aspect));
    const previewHeight =
      previewAssetId === asset.id
        ? kind === "audio"
          ? 48
          : Math.round(galleryCardWidth * 0.62)
        : 0;

    return Math.round(
      mediaHeight + previewHeight + 18 + galleryCardVerticalGap,
    );
  };

  useEffect(() => {
    const node = galleryScrollRef.current;
    if (!node) {
      return;
    }

    const updateViewportWidth = () => {
      setGalleryViewportWidth(node.clientWidth);
    };

    updateViewportWidth();
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [galleryColumnWidth]);

  const virtualizer = useVirtualizer({
    count: visibleAssets.length,
    getScrollElement: () => galleryScrollRef.current,
    estimateSize: estimateItemSize,
    overscan: virtualOverscan,
    lanes: galleryColumnCount,
    getItemKey: (index) => visibleAssets[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualItemIndex =
    virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    if (
      !isTauriRuntime() ||
      loading ||
      page >= totalPages ||
      visibleAssets.length === 0
    ) {
      return;
    }

    const triggerIndex = Math.max(0, visibleAssets.length - loadAheadItems);
    if (lastVirtualItemIndex >= triggerIndex) {
      void loadMore(queryFilters);
    }
  }, [
    lastVirtualItemIndex,
    loadAheadItems,
    loadMore,
    loading,
    page,
    queryFilters,
    totalPages,
    visibleAssets.length,
  ]);

  return (
    <section className="explorer-shell">
      <div className="explorer-workspace">
        <aside className="explorer-sidebar">
          <div className="sidebar-head">
            <strong>Folders</strong>
            <button
              type="button"
              className="sidebar-import-button"
              disabled={loading || !isTauriRuntime()}
              onClick={() => void importRoot()}
              title="Import folder"
              aria-label="Import folder"
            >
              <FolderPlus size={12} aria-hidden="true" />
            </button>
          </div>
          <div className="root-list">
            <button
              type="button"
              className={`root-all-button ${selectedRootPath === null ? "is-active" : ""}`}
              onClick={() => setSelectedRootPath(null)}
              title="Show all"
            >
              <Compass size={11} aria-hidden="true" />
              All
            </button>
            {scanRoots.map((root) => (
              <RootItem
                key={root.rootPath}
                root={root}
                active={root.rootPath === selectedRootPath}
                loading={loading}
                isScanning={Boolean(scanProgress)}
                syncingRootPath={syncingRootPath}
                removingRootPath={removingRootPath}
                onSelect={(rootPathValue) => {
                  setSelectedRootPath(rootPathValue);
                  setRootPath(rootPathValue);
                }}
                onSync={(rootPathValue) => void syncRoot(rootPathValue)}
                onStop={() => void haltScan()}
                onRemove={(rootPathValue) => void removeRoot(rootPathValue)}
              />
            ))}
            {scanRoots.length === 0 ? (
              <p className="meta sidebar-empty">No folders imported yet.</p>
            ) : null}
          </div>
        </aside>

        <section className="explorer-content">
          <section className="search-shell">
            <label className="search-input" htmlFor="asset-search-input">
              <Search size={14} aria-hidden="true" />
              <Input
                id="asset-search-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search filename, path, tags"
                className="search-input-control"
              />
            </label>
            <div
              className="filter-row"
              role="tablist"
              aria-label="Asset type filter"
            >
              {(["all", "audio", "video", "image"] as AssetKind[]).map(
                (kind) => {
                  const kindMeta = ASSET_KIND_META[kind];
                  const KindIcon = kindMeta.icon;
                  return (
                    <Button
                      key={kind}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={`chip chip-icon ${typeFilter === kind ? "is-active" : ""}`}
                      onClick={() => setTypeFilter(kind)}
                      title={kindMeta.label}
                      aria-label={kindMeta.label}
                    >
                      <KindIcon size={13} aria-hidden="true" />
                    </Button>
                  );
                },
              )}
            </div>
            <div className="gallery-zoom-control">
              <Search
                size={12}
                aria-hidden="true"
                className="gallery-zoom-icon"
              />
              <Slider
                value={[galleryZoom]}
                min={60}
                max={180}
                step={5}
                onValueChange={(value) => {
                  setGalleryZoom(value[0] ?? 100);
                }}
                className="gallery-zoom-slider"
              />
            </div>
          </section>

          {scanProgress ? (
            <div className="scan-status-row">
              <StatusText
                text={`${scanProgress.scanId} · ${scanProgress.status} · ${scanProgress.count} files${scanProgress.lastFile ? ` · ${scanProgress.lastFile}` : ""}`}
              />
              <Progress indeterminate />
            </div>
          ) : null}
          {previewJobEvent ? (
            <div className="scan-status-row">
              <StatusText
                text={`job:${previewJobEvent.id} · ${previewJobEvent.jobType} · ${previewJobEvent.status}${typeof previewJobEvent.progress === "number" ? ` · ${previewJobEvent.progress}%` : ""}${previewJobEvent.message ? ` · ${previewJobEvent.message}` : ""}`}
              />
              <Progress
                indeterminate={typeof previewJobEvent.progress !== "number"}
                value={previewJobEvent.progress ?? undefined}
              />
            </div>
          ) : null}
          {error ? <StatusText text={error} isError /> : null}

          <section className="gallery-scroll" ref={galleryScrollRef}>
            <div
              className="gallery-virtualizer"
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: `${galleryColumnCount * galleryCardWidth + (galleryColumnCount - 1) * galleryGap}px`,
              }}
            >
              {virtualItems.map((virtualItem) => {
                const asset = visibleAssets[virtualItem.index];
                if (!asset) {
                  return null;
                }
                const kind = classifyAsset(asset.typeName);
                const thumbSrc = toFileSrc(asset.thumbnailPath);
                const sourceSrc = toFileSrc(asset.originalPath);
                const isPreviewOpen = previewAssetId === asset.id;
                const lane =
                  typeof virtualItem.lane === "number"
                    ? virtualItem.lane
                    : virtualItem.index % galleryColumnCount;
                const left = lane * (galleryCardWidth + galleryGap);

                return (
                  <div
                    key={asset.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    className="gallery-virtual-item"
                    style={{
                      width: `${galleryCardWidth}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                      left: `${left}px`,
                    }}
                  >
                    <article
                      className="gallery-card"
                      tabIndex={0}
                      role="button"
                      onClick={() =>
                        setPreviewAssetId((current) =>
                          current === asset.id ? null : asset.id,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setPreviewAssetId((current) =>
                            current === asset.id ? null : asset.id,
                          );
                        }
                      }}
                    >
                      <div
                        className="gallery-card-media"
                        style={{
                          aspectRatio: String(
                            assetAspectById[asset.id] ??
                              (kind === "audio"
                                ? 2.8
                                : kind === "video"
                                  ? 16 / 9
                                  : 4 / 3),
                          ),
                        }}
                      >
                        {kind === "audio" ? (
                          <Waveform data={asset.waveformData} />
                        ) : thumbSrc ? (
                          <img
                            src={thumbSrc}
                            alt={asset.filename}
                            loading="lazy"
                          />
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

                        <div className="gallery-card-overlay">
                          <h3
                            className="gallery-overlay-title"
                            title={asset.filename}
                          >
                            {asset.filename}
                          </h3>
                        </div>
                      </div>

                      {isPreviewOpen && sourceSrc ? (
                        <div className="gallery-preview-inline">
                          {kind === "audio" ? (
                            <audio
                              controls
                              preload="metadata"
                              src={sourceSrc}
                            />
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
                    </article>
                  </div>
                );
              })}
            </div>
          </section>
        </section>
      </div>

      <Dialog
        open={quicklookAsset !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQuicklookAssetId(null);
          }
        }}
        title={quicklookAsset ? quicklookAsset.filename : "Quicklook"}
      >
        {quicklookAsset ? (
          <div className="quicklook-panel">
            <p className="meta" title={quicklookAsset.originalPath}>
              {quicklookAsset.originalPath}
            </p>
            <p className="meta">
              {formatFileSize(quicklookAsset.fileSize)} ·{" "}
              {formatDate(quicklookAsset.dateModified)}
            </p>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
