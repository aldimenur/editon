import { convertFileSrc } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Compass,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { onScanProgress, useAssetsStore } from "@/features/assets";
import type {
  QueryAssetsInput,
  ScanRoot,
} from "@/features/assets/api/assets-api";
import { onTrimReady, trimMedia } from "@/features/assets/api/assets-api";
import type { AssetItem } from "@/entities/asset/model/asset.types";
import { tauriInvoke } from "@/shared/api/tauri-client";
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

type TrimDraft = {
  duration: number;
  start: number;
  end: number;
  savedStart: number;
  savedEnd: number;
};

type AssetMutationInput = {
  action: "rename" | "delete" | "set_tags";
  assetId?: number;
  path?: string;
  newName?: string;
  tags?: string[];
};

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

const DRAG_ICON_FALLBACK = "../public/convertico-icon (1).ico";

let dragFallbackImagePromise: Promise<HTMLImageElement | null> | null = null;

function loadDragFallbackImage(): Promise<HTMLImageElement | null> {
  if (dragFallbackImagePromise) {
    return dragFallbackImagePromise;
  }

  dragFallbackImagePromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = DRAG_ICON_FALLBACK;
  });

  return dragFallbackImagePromise;
}

function trimDragLabel(label: string, max = 36): string {
  const normalized = label.trim();
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max - 1)}...`;
}

async function buildDragIconWithFilename(filename: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 72;

  const context = canvas.getContext("2d");
  if (!context) {
    return DRAG_ICON_FALLBACK;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(10, 14, 20, 0.5)";
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 12);
  context.fill();

  const fallbackImage = await loadDragFallbackImage();
  if (fallbackImage) {
    context.drawImage(fallbackImage, 12, 12, 48, 48);
  }

  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.font = "600 15px 'Segoe UI', 'Inter', sans-serif";
  context.textBaseline = "middle";
  context.fillText(trimDragLabel(filename || "Untitled"), 72, 36);

  return canvas.toDataURL("image/png");
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedRootPath, setSelectedRootPath] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<number | null>(null);
  const [trimByAssetId, setTrimByAssetId] = useState<Record<number, TrimDraft>>(
    {},
  );
  const [playingTrimAssetId, setPlayingTrimAssetId] = useState<number | null>(
    null,
  );
  const [playingAssetId, setPlayingAssetId] = useState<number | null>(null);
  const [mediaTimeByAssetId, setMediaTimeByAssetId] = useState<
    Record<number, number>
  >({});
  const [quicklookAssetId, setQuicklookAssetId] = useState<number | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [trimPendingAssetIds, setTrimPendingAssetIds] = useState<number[]>([]);
  const [trimJobEvent, setTrimJobEvent] = useState<JobEvent | null>(null);
  const [trimmedHighlightAssetIds, setTrimmedHighlightAssetIds] = useState<
    number[]
  >([]);
  const [renameDialogAsset, setRenameDialogAsset] = useState<AssetItem | null>(
    null,
  );
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteDialogAsset, setDeleteDialogAsset] = useState<AssetItem | null>(
    null,
  );
  const [isMutatingAsset, setIsMutatingAsset] = useState(false);
  const [previewJobEvent, setPreviewJobEvent] = useState<JobEvent | null>(null);
  const [assetAspectById, setAssetAspectById] = useState<
    Record<number, number>
  >({});
  const assetAspectByIdRef = useRef<Record<number, number>>({});
  const probingAssetIdsRef = useRef<Set<number>>(new Set());
  const aspectFlushFrameRef = useRef<number | null>(null);
  const mediaElementByAssetIdRef = useRef<
    Record<number, HTMLMediaElement | null>
  >({});
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const previewJobClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const trimJobByAssetIdRef = useRef<Record<number, number>>({});
  const trimJobClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const trimHighlightTimersRef = useRef<
    Record<number, ReturnType<typeof setTimeout>>
  >({});
  const suppressCardToggleRef = useRef(false);
  const suppressCardToggleTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
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
    const stored = window.localStorage.getItem("editon-sidebar-collapsed");
    if (stored === "1") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "editon-sidebar-collapsed",
      isSidebarCollapsed ? "1" : "0",
    );
  }, [isSidebarCollapsed]);

  useLayoutEffect(() => {
    if (previewAssetId === null) {
      if (playingTrimAssetId !== null) {
        const trimMedia = mediaElementByAssetIdRef.current[playingTrimAssetId];
        trimMedia?.pause();
        setPlayingTrimAssetId(null);
      }
      if (playingAssetId !== null) {
        const media = mediaElementByAssetIdRef.current[playingAssetId];
        media?.pause();
        setPlayingAssetId(null);
      }
      return;
    }

    if (playingTrimAssetId !== null && previewAssetId !== playingTrimAssetId) {
      const trimMedia = mediaElementByAssetIdRef.current[playingTrimAssetId];
      trimMedia?.pause();
      setPlayingTrimAssetId(null);
    }

    if (playingAssetId !== null && previewAssetId !== playingAssetId) {
      const media = mediaElementByAssetIdRef.current[playingAssetId];
      media?.pause();
      setPlayingAssetId(null);
    }
  }, [playingAssetId, playingTrimAssetId, previewAssetId]);

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

    const queueRefresh = () => {
      if (liveRefreshTimerRef.current) {
        return;
      }

      liveRefreshTimerRef.current = setTimeout(() => {
        liveRefreshTimerRef.current = null;
        void refresh(1, queryFilters);
      }, 220);
    };

    const terminalStatuses = new Set(["done", "failed", "cancelled"]);

    let unlisten: (() => void) | null = null;
    let disposed = false;
    onJobUpdated((payload) => {
      const isPreviewJob =
        payload.jobType === "generate_waveform" ||
        payload.jobType === "generate_video_thumbnail";
      const isTrimJob = payload.jobType === "trim_media";

      if (!isPreviewJob && !isTrimJob) {
        return;
      }

      if (isPreviewJob) {
        if (previewJobClearTimerRef.current) {
          clearTimeout(previewJobClearTimerRef.current);
          previewJobClearTimerRef.current = null;
        }

        setPreviewJobEvent(payload);

        if (payload.status === "done") {
          queueRefresh();
        }

        if (terminalStatuses.has(payload.status)) {
          previewJobClearTimerRef.current = setTimeout(() => {
            previewJobClearTimerRef.current = null;
            setPreviewJobEvent(null);
          }, 1800);
        }
      }

      if (isTrimJob) {
        if (trimJobClearTimerRef.current) {
          clearTimeout(trimJobClearTimerRef.current);
          trimJobClearTimerRef.current = null;
        }

        setTrimJobEvent(payload);

        const sourceAssetId = Object.entries(trimJobByAssetIdRef.current).find(
          ([, jobId]) => jobId === payload.id,
        )?.[0];

        if (sourceAssetId && terminalStatuses.has(payload.status)) {
          const sourceId = Number(sourceAssetId);
          delete trimJobByAssetIdRef.current[sourceId];
          setTrimPendingAssetIds((current) =>
            current.filter((assetId) => assetId !== sourceId),
          );
        }

        if (payload.status === "done") {
          queueRefresh();
        }

        if (terminalStatuses.has(payload.status)) {
          trimJobClearTimerRef.current = setTimeout(() => {
            trimJobClearTimerRef.current = null;
            setTrimJobEvent(null);
          }, 2200);
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
      if (trimJobClearTimerRef.current) {
        clearTimeout(trimJobClearTimerRef.current);
        trimJobClearTimerRef.current = null;
      }
    };
  }, [queryFilters, refresh, setError]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | null = null;
    let disposed = false;
    onTrimReady((payload) => {
      setTrimmedHighlightAssetIds((current) => {
        if (current.includes(payload.trimmedAssetId)) {
          return current;
        }
        return [...current, payload.trimmedAssetId];
      });

      const existingTimer =
        trimHighlightTimersRef.current[payload.trimmedAssetId];
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      trimHighlightTimersRef.current[payload.trimmedAssetId] = setTimeout(
        () => {
          delete trimHighlightTimersRef.current[payload.trimmedAssetId];
          setTrimmedHighlightAssetIds((current) =>
            current.filter((id) => id !== payload.trimmedAssetId),
          );
        },
        12_000,
      );

      void refresh(1, queryFilters);
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
        setError("Failed to subscribe trim updates.");
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
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

      const isSvg = asset.extension.toLowerCase() === "svg";
      const thumbSrc = toFileSrc(isSvg ? null : asset.thumbnailPath);
      const sourceSrc = toFileSrc(asset.originalPath);
      const imageSource = isSvg
        ? sourceSrc
        : (thumbSrc ?? (kind === "image" ? sourceSrc : null));

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

  const ensureTrimDraft = (assetId: number, duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    setTrimByAssetId((current) => {
      const existing = current[assetId];
      const nextDuration = Math.max(0.1, duration);

      if (!existing) {
        return {
          ...current,
          [assetId]: {
            duration: nextDuration,
            start: 0,
            end: nextDuration,
            savedStart: 0,
            savedEnd: nextDuration,
          },
        };
      }

      const currentSavedStart = existing.savedStart;
      const currentSavedEnd = existing.savedEnd;
      const nextStart = Math.max(
        0,
        Math.min(existing.start, nextDuration - 0.1),
      );
      const nextEnd = Math.max(
        nextStart + 0.1,
        Math.min(existing.end, nextDuration),
      );
      const nextSavedStart = Math.max(
        0,
        Math.min(currentSavedStart, nextDuration - 0.1),
      );
      const nextSavedEnd = Math.max(
        nextSavedStart + 0.1,
        Math.min(currentSavedEnd, nextDuration),
      );
      if (
        existing.duration === nextDuration &&
        existing.start === nextStart &&
        existing.end === nextEnd &&
        existing.savedStart === nextSavedStart &&
        existing.savedEnd === nextSavedEnd
      ) {
        return current;
      }

      return {
        ...current,
        [assetId]: {
          duration: nextDuration,
          start: nextStart,
          end: nextEnd,
          savedStart: nextSavedStart,
          savedEnd: nextSavedEnd,
        },
      };
    });
  };

  const updateTrimRange = (assetId: number, nextRange: [number, number]) => {
    const trim = trimByAssetId[assetId];
    if (!trim) {
      return;
    }

    const minGap = 0.1;
    const clampedStart = Math.max(0, Math.min(nextRange[0], trim.duration));
    const clampedEnd = Math.max(0, Math.min(nextRange[1], trim.duration));
    const orderedStart = Math.min(clampedStart, clampedEnd);
    const orderedEnd = Math.max(clampedStart, clampedEnd);
    const nextStart = Math.min(orderedStart, orderedEnd - minGap);
    const nextEnd = Math.max(orderedEnd, nextStart + minGap);

    setTrimByAssetId((current) => {
      const existing = current[assetId];
      if (!existing) {
        return current;
      }

      if (existing.start === nextStart && existing.end === nextEnd) {
        return current;
      }

      return {
        ...current,
        [assetId]: {
          ...existing,
          start: nextStart,
          end: nextEnd,
        },
      };
    });

    setMediaTimeByAssetId((current) => {
      const currentValue = current[assetId];
      if (typeof currentValue !== "number") {
        return current;
      }

      const clamped = Math.max(nextStart, Math.min(currentValue, nextEnd));
      if (clamped === currentValue) {
        return current;
      }

      return { ...current, [assetId]: clamped };
    });
  };

  const hasPendingTrimChange = (trim: TrimDraft) =>
    Math.abs(trim.start - trim.savedStart) > 0.01 ||
    Math.abs(trim.end - trim.savedEnd) > 0.01;

  const cancelTrimChanges = (assetId: number) => {
    setTrimByAssetId((current) => {
      const existing = current[assetId];
      if (!existing) {
        return current;
      }

      if (
        existing.start === existing.savedStart &&
        existing.end === existing.savedEnd
      ) {
        return current;
      }

      return {
        ...current,
        [assetId]: {
          ...existing,
          start: existing.savedStart,
          end: existing.savedEnd,
        },
      };
    });
  };

  const applyTrimChanges = async (asset: AssetItem) => {
    if (!isTauriRuntime()) {
      return;
    }

    const trim = trimByAssetId[asset.id];
    if (!trim || !hasPendingTrimChange(trim)) {
      return;
    }

    const pendingSet = new Set(trimPendingAssetIds);
    if (pendingSet.has(asset.id)) {
      return;
    }

    pendingSet.add(asset.id);
    setTrimPendingAssetIds(Array.from(pendingSet));

    try {
      const result = await trimMedia({
        assetId: asset.id,
        startSec: trim.start,
        endSec: trim.end,
      });
      const parsedJobId = Number(result.match(/(\d+)/)?.[1] ?? "0");
      if (Number.isFinite(parsedJobId) && parsedJobId > 0) {
        trimJobByAssetIdRef.current[asset.id] = parsedJobId;
      } else {
        setTrimPendingAssetIds((current) =>
          current.filter((id) => id !== asset.id),
        );
        setError("Trim was queued but job id was not returned.");
        return;
      }

      setTrimByAssetId((current) => {
        const existing = current[asset.id];
        if (!existing) {
          return current;
        }
        return {
          ...current,
          [asset.id]: {
            ...existing,
            savedStart: existing.start,
            savedEnd: existing.end,
          },
        };
      });
    } catch (reason) {
      setTrimPendingAssetIds((current) =>
        current.filter((id) => id !== asset.id),
      );
      setError(
        reason instanceof Error ? reason.message : "Failed to queue trim job",
      );
    }
  };

  const playTrimSegment = (assetId: number, startAt?: number) => {
    const media = mediaElementByAssetIdRef.current[assetId];
    const trim = trimByAssetId[assetId];
    if (!media || !trim) {
      return;
    }

    if (playingAssetId !== null && playingAssetId !== assetId) {
      mediaElementByAssetIdRef.current[playingAssetId]?.pause();
    }
    const playhead = mediaTimeByAssetId[assetId];
    const preferredStart =
      typeof startAt === "number"
        ? startAt
        : typeof playhead === "number"
          ? playhead
          : trim.start;
    const startFrom = Math.max(trim.start, Math.min(preferredStart, trim.end));
    media.currentTime = startFrom;
    setMediaTimeByAssetId((current) => ({ ...current, [assetId]: startFrom }));
    void media.play();
    setPlayingAssetId(assetId);
    setPlayingTrimAssetId(assetId);
  };

  const stopTrimSegment = (assetId: number) => {
    const media = mediaElementByAssetIdRef.current[assetId];
    const trim = trimByAssetId[assetId];
    if (!media || !trim) {
      setPlayingTrimAssetId(null);
      return;
    }

    media.pause();
    media.currentTime = trim.start;
    setMediaTimeByAssetId((current) => ({ ...current, [assetId]: trim.start }));
    if (playingAssetId === assetId) {
      setPlayingAssetId(null);
    }
    setPlayingTrimAssetId(null);
  };

  const pauseTrimSegment = (assetId: number) => {
    const media = mediaElementByAssetIdRef.current[assetId];
    if (!media) {
      setPlayingTrimAssetId(null);
      return;
    }

    media.pause();
    setMediaTimeByAssetId((current) => ({
      ...current,
      [assetId]: media.currentTime,
    }));
    if (playingAssetId === assetId) {
      setPlayingAssetId(null);
    }
    setPlayingTrimAssetId(null);
  };

  const toggleTrimPreview = (assetId: number) => {
    if (playingTrimAssetId === assetId) {
      pauseTrimSegment(assetId);
      return;
    }

    playTrimSegment(assetId);
  };

  const onInlineTimeUpdate = (assetId: number, nextTime: number) => {
    setMediaTimeByAssetId((current) => {
      if (current[assetId] === nextTime) {
        return current;
      }
      return { ...current, [assetId]: nextTime };
    });

    const trim = trimByAssetId[assetId];
    if (playingTrimAssetId === assetId && trim && nextTime >= trim.end) {
      stopTrimSegment(assetId);
    }
  };

  const updatePlayhead = (assetId: number, nextValue: number) => {
    const media = mediaElementByAssetIdRef.current[assetId];
    const trim = trimByAssetId[assetId];
    if (!media || !trim) {
      return null;
    }

    const clamped = Math.max(0, Math.min(nextValue, trim.duration));
    media.currentTime = clamped;
    setMediaTimeByAssetId((current) => ({ ...current, [assetId]: clamped }));
    return clamped;
  };

  const setPlayheadFromClientX = (
    assetId: number,
    trackElement: HTMLElement,
    clientX: number,
  ) => {
    const trim = trimByAssetId[assetId];
    if (!trim) {
      return null;
    }

    const rect = trackElement.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const ratio = Math.max(0, Math.min((clientX - rect.left) / width, 1));
    return updatePlayhead(assetId, trim.duration * ratio);
  };

  const seekAndPlayFromClientX = (
    assetId: number,
    trackElement: HTMLElement,
    clientX: number,
  ) => {
    const nextTime = setPlayheadFromClientX(assetId, trackElement, clientX);
    if (typeof nextTime !== "number") {
      return;
    }

    playTrimSegment(assetId, nextTime);
  };

  const startPlayheadDrag = (
    assetId: number,
    trackElement: HTMLElement,
    startClientX: number,
  ) => {
    suppressCardToggleRef.current = true;
    if (suppressCardToggleTimerRef.current) {
      window.clearTimeout(suppressCardToggleTimerRef.current);
      suppressCardToggleTimerRef.current = null;
    }

    setPlayheadFromClientX(assetId, trackElement, startClientX);

    const onMove = (event: PointerEvent) => {
      setPlayheadFromClientX(assetId, trackElement, event.clientX);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      suppressCardToggleTimerRef.current = setTimeout(() => {
        suppressCardToggleRef.current = false;
        suppressCardToggleTimerRef.current = null;
      }, 140);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

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
      ? Math.max(96, galleryColumnWidth)
      : Math.max(96, galleryColumnWidth);
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

    return Math.round(mediaHeight + galleryCardVerticalGap);
  };

  useEffect(() => {
    return () => {
      if (suppressCardToggleTimerRef.current) {
        window.clearTimeout(suppressCardToggleTimerRef.current);
        suppressCardToggleTimerRef.current = null;
      }

      for (const timer of Object.values(trimHighlightTimersRef.current)) {
        window.clearTimeout(timer);
      }
      trimHighlightTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const node = galleryScrollRef.current;
    if (!node) {
      return;
    }

    const updateViewportWidth = () => {
      const nextWidth = Math.round(node.getBoundingClientRect().width);
      if (nextWidth <= 0) {
        return;
      }

      setGalleryViewportWidth((current) =>
        current === nextWidth ? current : nextWidth,
      );
    };

    updateViewportWidth();
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [galleryColumnWidth, debouncedQuery, selectedRootPath, typeFilter]);

  const virtualizerLayoutKey = `${typeFilter}|${selectedRootPath ?? "all"}|${debouncedQuery}`;

  const virtualizer = useVirtualizer({
    count: visibleAssets.length,
    getScrollElement: () => galleryScrollRef.current,
    estimateSize: estimateItemSize,
    overscan: virtualOverscan,
    lanes: galleryColumnCount,
    getItemKey: (index) =>
      `${virtualizerLayoutKey}:${visibleAssets[index]?.id ?? index}`,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualItemIndex =
    virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    const node = galleryScrollRef.current;
    if (node) {
      node.scrollTop = 0;
    }
    virtualizer.scrollToOffset(0);

    setPreviewAssetId(null);
    setPlayingAssetId(null);
    setPlayingTrimAssetId(null);
    let frameA = 0;
    let frameB = 0;
    frameA = window.requestAnimationFrame(() => {
      const nextNode = galleryScrollRef.current;
      if (!nextNode) {
        return;
      }

      nextNode.scrollTop = 0;
      setGalleryViewportWidth((current) => {
        const nextWidth = Math.round(nextNode.getBoundingClientRect().width);
        if (nextWidth <= 0) {
          return current;
        }
        return current === nextWidth ? current : nextWidth;
      });
      virtualizer.scrollToOffset(0);
      virtualizer.measure();
      frameB = window.requestAnimationFrame(() => {
        virtualizer.scrollToOffset(0);
        virtualizer.measure();
        window.requestAnimationFrame(() => {
          virtualizer.scrollToOffset(0);
          virtualizer.measure();
        });
      });
    });

    return () => {
      if (frameA) {
        window.cancelAnimationFrame(frameA);
      }
      if (frameB) {
        window.cancelAnimationFrame(frameB);
      }
    };
  }, [virtualizerLayoutKey]);

  useEffect(() => {
    const node = galleryScrollRef.current;
    if (!node) {
      virtualizer.measure();
      return;
    }

    const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
    if (node.scrollTop > maxScroll) {
      node.scrollTop = Math.max(0, maxScroll);
    }
    virtualizer.measure();
  }, [items, virtualizerLayoutKey]);

  useEffect(() => {
    setSelectedAssetIds((current) => {
      if (current.length === 0) {
        return current;
      }

      const visibleIds = new Set(visibleAssets.map((asset) => asset.id));
      const filtered = current.filter((id) => visibleIds.has(id));
      return filtered.length === current.length ? current : filtered;
    });
  }, [visibleAssets]);

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

  const startExternalAssetDrag = async (anchorAssetId: number) => {
    if (!isTauriRuntime()) {
      return;
    }

    const selectedSet = new Set(selectedAssetIds);
    const dragAssets =
      selectedSet.size > 0 && selectedSet.has(anchorAssetId)
        ? visibleAssets.filter((asset) => selectedSet.has(asset.id))
        : visibleAssets.filter((asset) => asset.id === anchorAssetId);

    const dragPaths = Array.from(
      new Set(
        dragAssets
          .map((asset) => asset.originalPath.trim())
          .filter((path) => path.length > 0),
      ),
    );

    if (dragPaths.length === 0) {
      return;
    }

    const leadAssetName = dragAssets[0]?.filename ?? "Untitled";
    const dragLabel =
      dragAssets.length > 1
        ? `${leadAssetName} +${dragAssets.length - 1}`
        : leadAssetName;
    const dragIcon = await buildDragIconWithFilename(dragLabel);

    await startDrag({
      item: dragPaths,
      icon: dragIcon,
      mode: "copy",
    });
  };

  const runAssetMutation = async (
    input: AssetMutationInput,
    onDone: () => void,
  ) => {
    if (!isTauriRuntime()) {
      return;
    }

    setIsMutatingAsset(true);
    try {
      await tauriInvoke<string>("v2_asset_mutation", { input });
      await refresh(page, queryFilters);
      onDone();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Asset mutation failed",
      );
    } finally {
      setIsMutatingAsset(false);
    }
  };

  const openAssetInFolder = async (asset: AssetItem) => {
    if (!isTauriRuntime()) {
      return;
    }

    try {
      await revealItemInDir(asset.originalPath);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to reveal file in folder",
      );
    }
  };

  const confirmRenameAsset = async () => {
    if (!renameDialogAsset) {
      return;
    }

    const nextName = renameDraft.trim();
    if (!nextName) {
      setError("Filename is required.");
      return;
    }

    if (nextName === renameDialogAsset.filename) {
      setRenameDialogAsset(null);
      return;
    }

    await runAssetMutation(
      {
        action: "rename",
        assetId: renameDialogAsset.id,
        newName: nextName,
      },
      () => {
        setRenameDialogAsset(null);
      },
    );
  };

  const confirmDeleteAsset = async () => {
    if (!deleteDialogAsset) {
      return;
    }

    await runAssetMutation(
      {
        action: "delete",
        assetId: deleteDialogAsset.id,
      },
      () => {
        setDeleteDialogAsset(null);
        setSelectedAssetIds((current) =>
          current.filter((id) => id !== deleteDialogAsset.id),
        );
        setPreviewAssetId((current) =>
          current === deleteDialogAsset.id ? null : current,
        );
      },
    );
  };

  const openAssetContextMenu = async (
    event: MouseEvent<HTMLElement>,
    asset: AssetItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isTauriRuntime()) {
      return;
    }

    setSelectedAssetIds([asset.id]);

    const menu = await Menu.new({
      items: [
        {
          id: `asset-caption-${asset.id}`,
          text: trimDragLabel(asset.filename, 56),
          enabled: false,
        },
        {
          id: `asset-open-folder-${asset.id}`,
          text: "Open file in folder",
          action: () => {
            void openAssetInFolder(asset);
          },
        },
        {
          id: `asset-rename-${asset.id}`,
          text: "Rename",
          action: () => {
            setRenameDraft(asset.filename);
            setRenameDialogAsset(asset);
          },
        },
        {
          id: `asset-delete-${asset.id}`,
          text: "Delete",
          action: () => {
            setDeleteDialogAsset(asset);
          },
        },
      ],
    });

    try {
      await menu.popup();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to open context menu",
      );
    } finally {
      await menu.close().catch(() => undefined);
    }
  };

  return (
    <section className="explorer-shell">
      <div
        className={`explorer-workspace ${isSidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
      >
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
            <button
              type="button"
              className={`sidebar-toggle ${isSidebarCollapsed ? "is-active" : ""}`}
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              title={isSidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
              aria-label={
                isSidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"
              }
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen size={13} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={13} aria-hidden="true" />
              )}
            </button>
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
          {trimJobEvent ? (
            <div className="scan-status-row">
              <StatusText
                text={`trim:${trimJobEvent.id} · ${trimJobEvent.status}${typeof trimJobEvent.progress === "number" ? ` · ${trimJobEvent.progress}%` : ""}${trimJobEvent.message ? ` · ${trimJobEvent.message}` : ""}`}
              />
              <Progress
                indeterminate={typeof trimJobEvent.progress !== "number"}
                value={trimJobEvent.progress ?? undefined}
              />
            </div>
          ) : null}
          {error ? <StatusText text={error} isError /> : null}

          <section className="gallery-scroll" ref={galleryScrollRef}>
            {scanRoots.length === 0 ? (
              <div className="gallery-empty-tip" role="note">
                <strong>No folder imported yet</strong>
                <p>
                  Click the <FolderPlus size={12} aria-hidden="true" /> button
                  in the Folders panel to import your first media path.
                </p>
              </div>
            ) : (
              <div
                key={virtualizerLayoutKey}
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
                  const isSvg = asset.extension.toLowerCase() === "svg";
                  const thumbSrc = toFileSrc(
                    isSvg ? null : asset.thumbnailPath,
                  );
                  const sourceSrc = toFileSrc(asset.originalPath);
                  const imageSrc = isSvg ? sourceSrc : thumbSrc;
                  const isPreviewOpen = previewAssetId === asset.id;
                  const isSelected = selectedAssetIds.includes(asset.id);
                  const isTrimmedHighlight = trimmedHighlightAssetIds.includes(
                    asset.id,
                  );
                  const trimDraft = trimByAssetId[asset.id] ?? null;
                  const canTrimInline = kind === "audio" || kind === "video";
                  const hasTrimChanges = trimDraft
                    ? hasPendingTrimChange(trimDraft)
                    : false;
                  const isTrimPending = trimPendingAssetIds.includes(asset.id);
                  const isMediaPlaying = playingAssetId === asset.id;
                  const mediaTime =
                    mediaTimeByAssetId[asset.id] ?? trimDraft?.start ?? 0;
                  const playheadPercent = trimDraft
                    ? (Math.max(0, Math.min(mediaTime, trimDraft.duration)) /
                        Math.max(0.001, trimDraft.duration)) *
                      100
                    : 0;
                  const lane =
                    typeof virtualItem.lane === "number"
                      ? virtualItem.lane
                      : virtualItem.index % galleryColumnCount;
                  const left = lane * (galleryCardWidth + galleryGap);

                  return (
                    <div
                      key={`${virtualizerLayoutKey}:${asset.id}`}
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
                        className={`gallery-card ${isPreviewOpen ? "is-active" : ""} ${isSelected ? "is-selected" : ""} ${isTrimmedHighlight ? "is-trimmed" : ""}`}
                        tabIndex={0}
                        role="button"
                        draggable={isTauriRuntime()}
                        onDragStart={(event) => {
                          if (!isTauriRuntime()) {
                            return;
                          }

                          const selectedSet = new Set(selectedAssetIds);
                          const dragAssets =
                            selectedSet.size > 0 && selectedSet.has(asset.id)
                              ? visibleAssets.filter((candidate) =>
                                  selectedSet.has(candidate.id),
                                )
                              : [asset];

                          const dragPaths = dragAssets
                            .map((candidate) => candidate.originalPath.trim())
                            .filter((path) => path.length > 0);
                          const dragNames = dragAssets
                            .map((candidate) => candidate.filename.trim())
                            .filter((name) => name.length > 0);

                          if (dragPaths.length > 0) {
                            const uriList = dragPaths
                              .map(
                                (path) => `file://${path.replace(/\\/g, "/")}`,
                              )
                              .join("\r\n");
                            event.dataTransfer.setData(
                              "text/plain",
                              (dragNames.length > 0
                                ? dragNames
                                : dragPaths
                              ).join("\n"),
                            );
                            event.dataTransfer.setData(
                              "text/x-editon-file-paths",
                              dragPaths.join("\n"),
                            );
                            event.dataTransfer.setData(
                              "text/uri-list",
                              uriList,
                            );
                            event.dataTransfer.effectAllowed = "copy";
                          }

                          event.preventDefault();
                          void startExternalAssetDrag(asset.id);
                        }}
                        onContextMenu={(event) => {
                          void openAssetContextMenu(event, asset);
                        }}
                        onClick={(event) => {
                          if (suppressCardToggleRef.current) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }

                          const target = event.target as HTMLElement;
                          if (target.closest("[data-inline-control='true']")) {
                            return;
                          }

                          const isToggleSelect = event.metaKey || event.ctrlKey;
                          if (isToggleSelect) {
                            setSelectedAssetIds((current) =>
                              current.includes(asset.id)
                                ? current.filter((id) => id !== asset.id)
                                : [...current, asset.id],
                            );
                            return;
                          }

                          setSelectedAssetIds([asset.id]);

                          setPreviewAssetId((current) =>
                            current === asset.id ? null : asset.id,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedAssetIds([asset.id]);
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
                          {isPreviewOpen && kind === "video" && sourceSrc ? (
                            <video
                              className="gallery-inline-media"
                              preload="metadata"
                              src={sourceSrc}
                              poster={imageSrc ?? undefined}
                              ref={(element) => {
                                mediaElementByAssetIdRef.current[asset.id] =
                                  element;
                              }}
                              onLoadedMetadata={(event) => {
                                ensureTrimDraft(
                                  asset.id,
                                  event.currentTarget.duration,
                                );
                              }}
                              onTimeUpdate={(event) => {
                                onInlineTimeUpdate(
                                  asset.id,
                                  event.currentTarget.currentTime,
                                );
                              }}
                              onPlay={() => {
                                setPlayingAssetId(asset.id);
                              }}
                              onPause={() => {
                                if (playingAssetId === asset.id) {
                                  setPlayingAssetId(null);
                                }
                                if (playingTrimAssetId === asset.id) {
                                  setPlayingTrimAssetId(null);
                                }
                              }}
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : kind === "audio" ? (
                            <Waveform data={asset.waveformData} />
                          ) : imageSrc ? (
                            <img
                              src={imageSrc}
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

                          {isPreviewOpen && kind === "audio" && sourceSrc ? (
                            <audio
                              preload="metadata"
                              src={sourceSrc}
                              className="gallery-inline-audio"
                              ref={(element) => {
                                mediaElementByAssetIdRef.current[asset.id] =
                                  element;
                              }}
                              onLoadedMetadata={(event) => {
                                ensureTrimDraft(
                                  asset.id,
                                  event.currentTarget.duration,
                                );
                              }}
                              onTimeUpdate={(event) => {
                                onInlineTimeUpdate(
                                  asset.id,
                                  event.currentTarget.currentTime,
                                );
                              }}
                              onPlay={() => {
                                setPlayingAssetId(asset.id);
                              }}
                              onPause={() => {
                                if (playingAssetId === asset.id) {
                                  setPlayingAssetId(null);
                                }
                                if (playingTrimAssetId === asset.id) {
                                  setPlayingTrimAssetId(null);
                                }
                              }}
                            />
                          ) : null}

                          <div className="gallery-card-overlay">
                            <h3
                              className="gallery-overlay-title"
                              title={asset.filename}
                            >
                              {asset.filename}
                            </h3>
                          </div>
                          {isPreviewOpen &&
                          canTrimInline &&
                          sourceSrc &&
                          trimDraft ? (
                            <>
                              <button
                                type="button"
                                className={`gallery-inline-playfab ${isMediaPlaying ? "is-active" : ""}`}
                                data-inline-control="true"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleTrimPreview(asset.id);
                                }}
                                title={
                                  playingTrimAssetId === asset.id
                                    ? "Stop trim preview"
                                    : "Play trim preview"
                                }
                                aria-label={
                                  playingTrimAssetId === asset.id
                                    ? "Stop trim preview"
                                    : "Play trim preview"
                                }
                              >
                                {playingTrimAssetId === asset.id ? (
                                  <Pause size={16} aria-hidden="true" />
                                ) : (
                                  <Play size={16} aria-hidden="true" />
                                )}
                              </button>
                              <div
                                className="gallery-inline-trim-bar"
                                data-inline-control="true"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <Slider
                                  value={[trimDraft.start, trimDraft.end]}
                                  min={0}
                                  max={trimDraft.duration}
                                  step={0.1}
                                  onValueChange={(value) => {
                                    const start = value[0] ?? trimDraft.start;
                                    const end = value[1] ?? trimDraft.end;
                                    updateTrimRange(asset.id, [start, end]);
                                  }}
                                  className="gallery-inline-trim-slider"
                                />
                                <div className="gallery-inline-playhead-track">
                                  <div
                                    className="gallery-inline-playhead-hitbox"
                                    onPointerDown={(event) => {
                                      if (event.button !== 0) {
                                        return;
                                      }

                                      event.preventDefault();
                                      event.stopPropagation();
                                      seekAndPlayFromClientX(
                                        asset.id,
                                        event.currentTarget,
                                        event.clientX,
                                      );
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className={`gallery-inline-playhead ${isMediaPlaying ? "is-active" : ""}`}
                                    style={{ left: `${playheadPercent}%` }}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                    }}
                                    onPointerDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      const track =
                                        event.currentTarget.parentElement;
                                      if (!track) {
                                        return;
                                      }
                                      startPlayheadDrag(
                                        asset.id,
                                        track,
                                        event.clientX,
                                      );
                                    }}
                                    aria-label="Playhead"
                                  />
                                </div>
                              </div>
                              {hasTrimChanges ? (
                                <div
                                  className="gallery-inline-trim-actions"
                                  data-inline-control="true"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isTrimPending}
                                    onClick={() => cancelTrimChanges(asset.id)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={isTrimPending}
                                    onClick={() => void applyTrimChanges(asset)}
                                  >
                                    {isTrimPending ? "Applying..." : "Apply"}
                                  </Button>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            )}
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

      <Dialog
        open={renameDialogAsset !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameDialogAsset(null);
          }
        }}
        title="Rename Asset"
      >
        {renameDialogAsset ? (
          <form
            className="asset-dialog-body"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmRenameAsset();
            }}
          >
            <div className="asset-dialog-field">
              <p className="asset-dialog-label">Current Filename</p>
              <p
                className="asset-dialog-value"
                title={renameDialogAsset.filename}
              >
                {renameDialogAsset.filename}
              </p>
            </div>
            <div className="asset-dialog-field">
              <p className="asset-dialog-label">Location</p>
              <p
                className="asset-dialog-value asset-dialog-path"
                title={renameDialogAsset.originalPath}
              >
                {renameDialogAsset.originalPath}
              </p>
            </div>
            <label className="asset-dialog-field" htmlFor="asset-rename-input">
              <span className="asset-dialog-label">New Filename</span>
              <Input
                id="asset-rename-input"
                className="asset-dialog-input"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                placeholder="New filename"
                autoFocus
              />
            </label>
            <div className="asset-dialog-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenameDialogAsset(null)}
                disabled={isMutatingAsset}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isMutatingAsset ||
                  renameDraft.trim().length === 0 ||
                  renameDraft.trim() === renameDialogAsset.filename
                }
              >
                Rename
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

      <Dialog
        open={deleteDialogAsset !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogAsset(null);
          }
        }}
        title="Delete Asset"
      >
        {deleteDialogAsset ? (
          <div className="asset-dialog-body">
            <div className="asset-dialog-field">
              <p className="asset-dialog-label">Filename</p>
              <p
                className="asset-dialog-value"
                title={deleteDialogAsset.filename}
              >
                {deleteDialogAsset.filename}
              </p>
            </div>
            <div className="asset-dialog-field">
              <p className="asset-dialog-label">Location</p>
              <p
                className="asset-dialog-value asset-dialog-path"
                title={deleteDialogAsset.originalPath}
              >
                {deleteDialogAsset.originalPath}
              </p>
            </div>
            <p className="asset-dialog-note is-danger">
              This permanently removes the file from disk and deletes its
              database record.
            </p>
            <div className="asset-dialog-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeleteDialogAsset(null)}
                disabled={isMutatingAsset}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="asset-dialog-danger"
                onClick={() => void confirmDeleteAsset()}
                disabled={isMutatingAsset}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
