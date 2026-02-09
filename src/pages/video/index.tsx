import useAssetStore from "@/stores/asset-store";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import { Button } from "@/components/ui/button";
import useViewStore from "@/stores/view-store";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyDragImage, getDragPreviewIcon } from "@/lib/drag-preview";
import TagsDialog from "@/components/TagsDialog";
import GlobalAssetNavbar from "@/components/global-asset-navbar";
import { trimMediaAction } from "@/lib/actions/trim-media";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ITEM_HEIGHTS = {
  list: 240,
  grid: 100,
  large: 400,
};

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const VideoPage = () => {
  const {
    videoSearch,
    setVideoSearch,
    parentPath,
    videoFiles,
    videoSearchCount,
    isLoading,
    fetchVideoAssets,
    video,
  } = useAssetStore((state) => state);

  const [pageSize] = useState(10);
  const { viewModeVideo, setViewModeVideo } = useViewStore((state) => state);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [tagsDialogAssetIds, setTagsDialogAssetIds] = useState<number[]>([]);
  const [tagsDialogCurrentTags, setTagsDialogCurrentTags] = useState<
    string | null
  >(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<Asset | null>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const fullscreenTrimBarRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreenPlaying, setIsFullscreenPlaying] = useState(false);
  const [isFullscreenMuted, setIsFullscreenMuted] = useState(true);
  const [fullscreenCurrentTime, setFullscreenCurrentTime] = useState(0);
  const [fullscreenDuration, setFullscreenDuration] = useState(0);
  const [fullscreenTrimRange, setFullscreenTrimRange] = useState({
    start: 0,
    end: 1,
  });
  const [fullscreenAppliedTrimRange, setFullscreenAppliedTrimRange] = useState({
    start: 0,
    end: 1,
  });
  const [isFullscreenTrimming, setIsFullscreenTrimming] = useState(false);
  const [fullscreenTrimError, setFullscreenTrimError] = useState<string | null>(
    null,
  );
  const [fullscreenTrimmedOutputPath, setFullscreenTrimmedOutputPath] =
    useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [gridColumns, setGridColumns] = useState(3);
  const [gridItemHeight, setGridItemHeight] = useState(160);
  const appWindow = getCurrentWindow();
  const filteredAssetIds = videoFiles
    .map((file) => file.id)
    .filter((id): id is number => typeof id === "number");
  const allFilteredSelected =
    filteredAssetIds.length > 0 &&
    filteredAssetIds.every((id) => selectedAssetIds.includes(id));
  const hasMore = videoFiles.length < videoSearchCount;
  const videoSearchText = videoSearch.search;
  const hasFullscreenTrimChanges =
    Math.abs(fullscreenTrimRange.start - fullscreenAppliedTrimRange.start) >
    0.0001 ||
    Math.abs(fullscreenTrimRange.end - fullscreenAppliedTrimRange.end) > 0.0001;

  // Track container width and update columns + row height responsively
  useEffect(() => {
    if (!containerRef.current) return;

    const updateGrid = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;

      let columns = 2;
      if (width >= 1600) {
        columns = 5;
      } else if (width >= 1200) {
        columns = 4;
      } else if (width >= 768) {
        columns = 3;
      }

      const gap = 8;
      const totalGap = gap * (columns - 1);
      const cardWidth = Math.max(1, (width - totalGap) / columns);
      const cardHeight = Math.round((cardWidth * 9) / 16);

      setGridColumns(columns);
      setGridItemHeight(cardHeight);
    };

    const resizeObserver = new ResizeObserver(updateGrid);
    resizeObserver.observe(containerRef.current);
    updateGrid();

    return () => resizeObserver.disconnect();
  }, []);

  // initial load / path change
  useEffect(() => {
    if (!parentPath) {
      return;
    }
    fetchVideoAssets(1, pageSize, true);
  }, [parentPath, pageSize, video]);

  const fetchAvailableTags = useCallback(async () => {
    try {
      const tags = await invoke<string[]>("get_available_tags");
      setAvailableTags(tags);
      setTagFilter((prev) => prev.filter((tag) => tags.includes(tag)));
    } catch (error) {
      console.error("Failed to fetch tags:", error);
      setAvailableTags([]);
      setTagFilter([]);
    }
  }, []);

  // Fetch available tags from database
  useEffect(() => {
    if (!parentPath) return;
    fetchAvailableTags();
  }, [parentPath, fetchAvailableTags]);

  // search with debounce (including tag filter)
  useEffect(() => {
    if (!parentPath) return;

    const timeout = setTimeout(() => {
      setVideoSearch(videoSearchText, tagFilter);
      fetchVideoAssets(1, pageSize, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [videoSearchText, tagFilter, parentPath, pageSize]);

  // Calculate row count based on view mode
  const getRowCount = () => {
    if (viewModeVideo === "grid") {
      return Math.ceil(videoFiles.length / gridColumns);
    }
    return videoFiles.length;
  };

  const rowHeight =
    viewModeVideo === "grid" ? gridItemHeight : ITEM_HEIGHTS[viewModeVideo];

  const rowVirtualizer = useVirtualizer({
    count: getRowCount(),
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => `${viewModeVideo}-${gridColumns}-${index}`, // reset size cache when mode or columns change
    overscan: 2,
  });

  // compute virtual items once per render
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || videoFiles.length === 0) return;
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // Calculate actual file index based on view mode
    const actualLastIndex =
      viewModeVideo === "grid"
        ? lastItem.index * gridColumns + (gridColumns - 1)
        : lastItem.index;

    // when we scroll within a few items of the end, load next page
    if (actualLastIndex >= videoFiles.length - 5) {
      const nextPage = Math.floor(videoFiles.length / pageSize) + 1;
      console.log("Loading next page:", nextPage);
      fetchVideoAssets(nextPage, pageSize);
    }
  }, [
    virtualItems.length,
    videoFiles.length,
    hasMore,
    isLoading,
    pageSize,
    viewModeVideo,
    gridColumns,
  ]);

  // Reset scroll position when view mode changes
  useEffect(() => {
    rowVirtualizer.measure(); // force recalculation with new item heights
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewModeVideo, gridColumns]);

  const highlightText = (text: string, search: string) => {
    if (typeof search !== "string" || !search.trim()) return text;

    // Tokenize search query: split by whitespace
    const tokens = search
      .split(/\s+/)
      .filter((token) => token.trim().length > 0)
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // Escape regex special chars

    if (tokens.length === 0) return text;

    // Create regex pattern that matches any token
    const pattern = new RegExp(`(${tokens.join("|")})`, "gi");
    const parts = text.split(pattern);

    return (
      <>
        {parts.map((part, index) => {
          // Check if this part matches any of the search tokens
          const isMatch = tokens.some(
            (token) => part.toLowerCase() === token.toLowerCase(),
          );

          return isMatch ? (
            <mark
              key={index}
              className="bg-yellow-300 dark:bg-yellow-600 text-foreground"
            >
              {part}
            </mark>
          ) : (
            part
          );
        })}
      </>
    );
  };

  const handleTagsClick = (
    assetId: number,
    tags: string | null | undefined,
  ) => {
    setTagsDialogAssetIds([assetId]);
    setTagsDialogCurrentTags(tags ?? null);
    setTagsDialogOpen(true);
  };

  const handleTagsUpdated = () => {
    fetchVideoAssets(1, pageSize, true);
    fetchAvailableTags();
    if (tagsDialogAssetIds.length > 1) {
      setSelectedAssetIds([]);
    }
  };

  const handleTagsDialogChange = (open: boolean) => {
    setTagsDialogOpen(open);
    if (!open) {
      setTagsDialogAssetIds([]);
      setTagsDialogCurrentTags(null);
    }
  };

  const parseTags = (tags: string | null | undefined) =>
    tags
      ? tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
      : [];

  const getCommonTags = (assets: { tags?: string | null }[]) => {
    if (assets.length === 0) return null;
    let common = parseTags(assets[0].tags);
    for (let i = 1; i < assets.length; i += 1) {
      const tagSet = new Set(parseTags(assets[i].tags));
      common = common.filter((tag) => tagSet.has(tag));
      if (common.length === 0) break;
    }
    return common.length > 0 ? common.join(", ") : null;
  };

  const toggleSelection = (assetId: number) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId],
    );
  };

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const FULLSCREEN_MIN_TRIM_WIDTH = 0.02;

  useEffect(() => {
    if (!fullscreenVideo) return;

    setIsFullscreenPlaying(false);
    setIsFullscreenMuted(true);
    setFullscreenCurrentTime(0);
    setFullscreenDuration(0);
    setFullscreenTrimRange({ start: 0, end: 1 });
    setFullscreenAppliedTrimRange({ start: 0, end: 1 });
    setIsFullscreenTrimming(false);
    setFullscreenTrimError(null);
    setFullscreenTrimmedOutputPath(null);
  }, [fullscreenVideo?.original_path]);

  const closeFullscreen = () => {
    setFullscreenVideo(null);
    setFullscreenTrimError(null);
  };

  const handleFullscreenTogglePlayback = () => {
    const node = fullscreenVideoRef.current;
    if (!node) return;

    if (node.paused) {
      void node.play();
    } else {
      node.pause();
    }
  };

  const handleFullscreenToggleMute = () => {
    const nextMuted = !isFullscreenMuted;
    setIsFullscreenMuted(nextMuted);
    if (fullscreenVideoRef.current) {
      fullscreenVideoRef.current.muted = nextMuted;
    }
  };

  const seekFullscreenTo = (nextTime: number) => {
    if (fullscreenVideoRef.current) {
      fullscreenVideoRef.current.currentTime = nextTime;
    }
    setFullscreenCurrentTime(nextTime);
  };

  const handleFullscreenVideoClick = (
    event: ReactMouseEvent<HTMLVideoElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    handleFullscreenTogglePlayback();
  };

  const handleFullscreenTrimBarClick = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!fullscreenTrimBarRef.current) return;
    const rect = fullscreenTrimBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setFullscreenTrimRange((prev) => {
      const distToStart = Math.abs(ratio - prev.start);
      const distToEnd = Math.abs(ratio - prev.end);

      if (distToStart <= distToEnd) {
        const nextStart = clamp(ratio, 0, prev.end - FULLSCREEN_MIN_TRIM_WIDTH);
        return { ...prev, start: nextStart };
      }

      const nextEnd = clamp(ratio, prev.start + FULLSCREEN_MIN_TRIM_WIDTH, 1);
      return { ...prev, end: nextEnd };
    });
    setFullscreenTrimError(null);
  };

  const startFullscreenTrimDrag = (
    mode: "start" | "end",
    event: ReactMouseEvent,
  ) => {
    if (!fullscreenTrimBarRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = fullscreenTrimBarRef.current.getBoundingClientRect();
    const initial = { ...fullscreenTrimRange };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - event.clientX) / rect.width;
      let nextStart = initial.start;
      let nextEnd = initial.end;

      if (mode === "start") {
        nextStart = clamp(
          initial.start + delta,
          0,
          initial.end - FULLSCREEN_MIN_TRIM_WIDTH,
        );
      } else {
        nextEnd = clamp(
          initial.end + delta,
          initial.start + FULLSCREEN_MIN_TRIM_WIDTH,
          1,
        );
      }

      setFullscreenTrimRange({ start: nextStart, end: nextEnd });
      setFullscreenTrimError(null);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleFullscreenTrimApply = async () => {
    if (!fullscreenVideo) return;
    const durationSec =
      fullscreenDuration > 0
        ? fullscreenDuration
        : fullscreenVideo.duration_sec;

    if (durationSec <= 0) {
      setFullscreenTrimError("Cannot trim media with unknown duration.");
      return;
    }

    setIsFullscreenTrimming(true);
    setFullscreenTrimError(null);

    try {
      const outputPath = await trimMediaAction({
        input_path: fullscreenVideo.original_path,
        start_sec: fullscreenTrimRange.start * durationSec,
        end_sec: fullscreenTrimRange.end * durationSec,
      });
      setFullscreenAppliedTrimRange(fullscreenTrimRange);
      setFullscreenTrimmedOutputPath(outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFullscreenTrimError(message);
      console.error("Failed to trim media in fullscreen:", error);
    } finally {
      setIsFullscreenTrimming(false);
    }
  };

  const handleFullscreenTrimCancel = () => {
    setFullscreenTrimRange(fullscreenAppliedTrimRange);
    setFullscreenTrimError(null);
  };

  const handleFullscreenTrimmedDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
  ) => {
    if (!fullscreenTrimmedOutputPath) return;
    event.preventDefault();
    event.stopPropagation();

    const dragPreview = getDragPreviewIcon(
      fullscreenTrimmedOutputPath,
      "Dragging trim",
    );
    applyDragImage(
      event.dataTransfer,
      dragPreview,
      fullscreenTrimmedOutputPath,
    );

    try {
      startDrag({
        item: [fullscreenTrimmedOutputPath],
        icon: dragPreview || fullscreenTrimmedOutputPath,
        mode: "copy",
      });
    } catch (error) {
      console.error("Failed to drag fullscreen trimmed media:", error);
    }
  };

  const handleFullscreenTrimmedDragEnd = (
    event: ReactDragEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDeleteFullscreenTrimmed = async () => {
    if (!fullscreenTrimmedOutputPath) return;
    try {
      await invoke("delete_file", { path: fullscreenTrimmedOutputPath });
      setFullscreenTrimmedOutputPath(null);
    } catch (error) {
      console.error("Failed to delete fullscreen trimmed media:", error);
    }
  };

  const openBulkTagsDialog = () => {
    const selectedAssets = videoFiles.filter((file) =>
      selectedAssetIds.includes(file.id ?? -1),
    );
    setTagsDialogAssetIds(selectedAssetIds);
    setTagsDialogCurrentTags(getCommonTags(selectedAssets));
    setTagsDialogOpen(true);
  };

  const selectAllFiltered = () => {
    setSelectedAssetIds(filteredAssetIds);
  };

  const handleDeleteClick = (path: string) => {
    setDeleteTargets([path]);
    setDeleteDialogOpen(true);
  };

  const handleBulkDeleteClick = () => {
    const selectedPaths = videoFiles
      .filter((file) =>
        typeof file.id === "number"
          ? selectedAssetIds.includes(file.id)
          : false,
      )
      .map((file) => file.original_path);

    if (selectedPaths.length === 0) return;

    setDeleteTargets(selectedPaths);
    setDeleteDialogOpen(true);
  };

  const handleDeleteDialogChange = (open: boolean) => {
    setDeleteDialogOpen(open);
    if (!open) {
      setDeleteTargets([]);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTargets.length === 0) return;

    try {
      for (const path of deleteTargets) {
        await invoke("delete_file", { path });
      }

      if (deleteTargets.length > 1) {
        setSelectedAssetIds([]);
      }

      setDeleteDialogOpen(false);
      setDeleteTargets([]);
      fetchVideoAssets(1, pageSize, true);
    } catch (error) {
      console.error("Failed to delete file(s):", error);
    }
  };

  const handleRenameClick = (path: string, currentName: string) => {
    setFileToRename(path);
    const lastDotIndex = currentName.lastIndexOf(".");
    const nameWithoutExt =
      lastDotIndex > 0 ? currentName.substring(0, lastDotIndex) : currentName;
    setNewFileName(nameWithoutExt);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (fileToRename && newFileName.trim()) {
      try {
        const originalFilename = fileToRename.split(/[\\/]/).pop() || "";
        const lastDotIndex = originalFilename.lastIndexOf(".");
        const extension =
          lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : "";

        const newFullName = newFileName.trim() + extension;

        await invoke("rename_file", {
          oldPath: fileToRename,
          newName: newFullName,
        });
        setRenameDialogOpen(false);
        setFileToRename(null);
        setNewFileName("");
        fetchVideoAssets(1, pageSize, true);
      } catch (error) {
        console.error("Failed to rename file:", error);
      }
    }
  };

  const handleRenameCancel = () => {
    setRenameDialogOpen(false);
    setFileToRename(null);
    setNewFileName("");
  };

  const renderTags = (tags: string | null | undefined) => {
    if (!tags) return null;
    const tagArray = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (tagArray.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {tagArray.slice(0, 3).map((tag, index) => (
          <span
            key={index}
            className="bg-primary/10 text-primary px-1 py-0.5 rounded text-xs"
          >
            {tag}
          </span>
        ))}
        {tagArray.length > 3 && (
          <span className="text-muted-foreground text-xs">
            +{tagArray.length - 3}
          </span>
        )}
      </div>
    );
  };

  const openContextMenu = useCallback(
    async (file: Asset, x: number, y: number) => {
      const fileId = file.id as number;
      const isSelected = selectedAssetIds.includes(fileId);

      const menu = await Menu.new({
        items: [
          {
            text: isSelected ? "Deselect" : "Select",
            accelerator: "S",
            action: () => toggleSelection(fileId),
          },
          {
            text: "Edit tags",
            accelerator: "T",
            action: () => handleTagsClick(fileId, file.tags ?? null),
          },
          {
            text: "Preview fullscreen",
            accelerator: "Enter",
            action: () => setFullscreenVideo(file),
          },
          {
            text: "Rename",
            accelerator: "F2",
            action: () => handleRenameClick(file.original_path, file.filename),
          },
          {
            text: "Show in folder",
            accelerator: "O",
            action: () => {
              void revealItemInDir(file.original_path);
            },
          },
          { item: "Separator" },
          {
            text: "Delete",
            accelerator: "Delete",
            action: () => handleDeleteClick(file.original_path),
          },
        ],
      });

      try {
        await menu.popup(new LogicalPosition(x, y), appWindow);
      } finally {
        await menu.close();
      }
    },
    [
      selectedAssetIds,
      appWindow,
      toggleSelection,
      handleTagsClick,
      handleRenameClick,
      handleDeleteClick,
    ],
  );

  const handleAssetDragStart = (
    event: ReactDragEvent<HTMLDivElement>,
    file: Asset,
  ) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-no-card-drag="true"]')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dragPreview = getDragPreviewIcon(
      file.original_path,
      "Dragging video",
    );
    applyDragImage(event.dataTransfer, dragPreview, file.original_path);

    try {
      startDrag({
        item: [file.original_path],
        icon: dragPreview || file.original_path,
        mode: "copy",
      });
    } catch (error) {
      console.error("Failed to drag video:", error);
    }
  };

  const handleAssetDragEnd = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const VideoCard = ({
    file,
    minHeight = 0,
  }: {
    file: Asset;
    minHeight?: number;
  }) => {
    const trimBarRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [trimRange, setTrimRange] = useState({ start: 0, end: 1 });
    const [appliedTrimRange, setAppliedTrimRange] = useState({
      start: 0,
      end: 1,
    });
    const [isTrimming, setIsTrimming] = useState(false);
    const [trimError, setTrimError] = useState<string | null>(null);
    const [trimmedOutputPath, setTrimmedOutputPath] = useState<string | null>(
      null,
    );
    const videoSrc = convertFileSrc(file.original_path);
    const thumbSrc = file.thumbnail_path
      ? convertFileSrc(file.thumbnail_path)
      : "";
    const isSelected = selectedAssetIds.includes(file.id ?? -1);
    const durationSec = file.duration_sec > 0 ? file.duration_sec : 0;
    const MIN_TRIM_WIDTH = 0.02;
    const hasTrimChanges =
      Math.abs(trimRange.start - appliedTrimRange.start) > 0.0001 ||
      Math.abs(trimRange.end - appliedTrimRange.end) > 0.0001;
    const isGrid = viewModeVideo === "grid";
    const showVideo = playing || !thumbSrc;

    useEffect(() => {
      setTrimRange({ start: 0, end: 1 });
      setAppliedTrimRange({ start: 0, end: 1 });
      setTrimError(null);
      setIsTrimming(false);
      setTrimmedOutputPath(null);
      setPlaying(false);
      setIsVideoPlaying(false);
      setIsMuted(true);
      setCurrentTime(0);
      setVideoDuration(0);
    }, [file.original_path]);

    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));

    const startTrimDrag = (mode: "start" | "end", event: ReactMouseEvent) => {
      if (!trimBarRef.current) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = trimBarRef.current.getBoundingClientRect();
      const initial = { ...trimRange };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = (moveEvent.clientX - event.clientX) / rect.width;
        let nextStart = initial.start;
        let nextEnd = initial.end;

        if (mode === "start") {
          nextStart = clamp(
            initial.start + delta,
            0,
            initial.end - MIN_TRIM_WIDTH,
          );
        } else {
          nextEnd = clamp(
            initial.end + delta,
            initial.start + MIN_TRIM_WIDTH,
            1,
          );
        }

        setTrimRange({ start: nextStart, end: nextEnd });
        setTrimError(null);
      };

      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    };

    const handleTrimApply = async (
      event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      if (durationSec <= 0) {
        setTrimError("Cannot trim media with unknown duration.");
        return;
      }

      setIsTrimming(true);
      setTrimError(null);

      try {
        const outputPath = await trimMediaAction({
          input_path: file.original_path,
          start_sec: trimRange.start * durationSec,
          end_sec: trimRange.end * durationSec,
        });
        setAppliedTrimRange(trimRange);
        setTrimmedOutputPath(outputPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTrimError(message);
        console.error("Failed to trim media:", error);
      } finally {
        setIsTrimming(false);
      }
    };

    const handleTrimCancel = (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setTrimRange(appliedTrimRange);
      setTrimError(null);
    };

    const handleTrimmedDragStart = (
      event: ReactDragEvent<HTMLButtonElement>,
    ) => {
      if (!trimmedOutputPath) return;
      event.preventDefault();
      event.stopPropagation();

      const dragPreview = getDragPreviewIcon(
        trimmedOutputPath,
        "Dragging trim",
      );
      applyDragImage(event.dataTransfer, dragPreview, trimmedOutputPath);

      try {
        startDrag({
          item: [trimmedOutputPath],
          icon: dragPreview || trimmedOutputPath,
          mode: "copy",
        });
      } catch (error) {
        console.error("Failed to drag trimmed media:", error);
      }
    };

    const handleTrimmedDragEnd = (event: ReactDragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleStartPlayback = () => {
      setPlaying(true);
      const node = videoRef.current;
      if (!node) return;
      void node.play().catch(() => {
        // Ignore autoplay restrictions and let user press play button.
      });
    };

    const handleSeek = (event: ReactMouseEvent<HTMLInputElement>) => {
      event.stopPropagation();
    };

    const handleTogglePlayback = (
      event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const node = videoRef.current;
      if (!node) {
        handleStartPlayback();
        return;
      }

      if (node.paused) {
        void node.play();
      } else {
        node.pause();
      }
    };

    const handleToggleMute = (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      if (videoRef.current) {
        videoRef.current.muted = nextMuted;
      }
    };

    const seekTo = (nextTime: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = nextTime;
      }
      setCurrentTime(nextTime);
    };

    const toggleVideoPlayback = () => {
      const node = videoRef.current;
      if (!node) return;

      if (node.paused) {
        void node.play();
      } else {
        node.pause();
      }
    };

    const handleVideoClick = (event: ReactMouseEvent<HTMLVideoElement>) => {
      event.preventDefault();
      event.stopPropagation();
      toggleVideoPlayback();
    };

    const handleTrimBarClick = (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!trimBarRef.current) return;
      const rect = trimBarRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      setTrimRange((prev) => {
        const distToStart = Math.abs(ratio - prev.start);
        const distToEnd = Math.abs(ratio - prev.end);

        if (distToStart <= distToEnd) {
          const nextStart = clamp(ratio, 0, prev.end - MIN_TRIM_WIDTH);
          return { ...prev, start: nextStart };
        }

        const nextEnd = clamp(ratio, prev.start + MIN_TRIM_WIDTH, 1);
        return { ...prev, end: nextEnd };
      });
      setTrimError(null);
    };

    return (
      <div
        key={file.id}
        className={`group relative flex flex-col border rounded-lg overflow-hidden bg-card transition-all hover:shadow-lg ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (file.id == null) return;
          void openContextMenu(file, event.clientX, event.clientY);
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            if (file.id == null) return;
            void openContextMenu(
              file,
              rect.left + rect.width / 2,
              rect.top + 20,
            );
          }
        }}
        title="Right-click or use Shift+F10 for actions"
        tabIndex={0}
        draggable
        onDragStart={(event) => handleAssetDragStart(event, file)}
        onDragEnd={handleAssetDragEnd}
        style={
          isGrid
            ? { height: gridItemHeight, aspectRatio: "16 / 9" }
            : { minHeight }
        }
      >
        <div className="absolute inset-0">
          {!showVideo ? (
            <div
              className="relative h-full w-full cursor-pointer"
              onClick={handleStartPlayback}
            >
              <img
                src={thumbSrc}
                className="absolute inset-0 h-full w-full object-cover bg-muted"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="rounded-full border border-white/50 bg-black/45 p-3 backdrop-blur-sm">
                  <Play className="h-7 w-7 text-white" />
                </div>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={videoSrc}
              className="absolute inset-0 h-full w-full object-cover bg-muted"
              playsInline
              disablePictureInPicture
              controlsList="nofullscreen"
              autoPlay={playing}
              muted={isMuted}
              onPlay={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
              onLoadedMetadata={(event) => {
                setVideoDuration(event.currentTarget.duration || 0);
              }}
              onTimeUpdate={(event) => {
                setCurrentTime(event.currentTarget.currentTime || 0);
              }}
              onClick={handleVideoClick}
            />
          )}
        </div>

        {showVideo && (
          <div
            className="absolute inset-x-2 bottom-8 z-20 flex items-center justify-between"
            data-no-card-drag="true"
          >
            <div className="flex items-center gap-1">
              <Button
                size="icon-xs"
                variant="outline"
                className="h-6 w-6 rounded-sm bg-background/80"
                onClick={handleTogglePlayback}
                title={isVideoPlaying ? "Pause" : "Play"}
              >
                {isVideoPlaying ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </Button>
              <Button
                size="icon-xs"
                variant="outline"
                className="h-6 w-6 rounded-sm bg-background/80"
                onClick={handleToggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="h-3 w-3" />
                ) : (
                  <Volume2 className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div className="rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground/90">
              {formatVideoTime(currentTime)} / {formatVideoTime(videoDuration)}
            </div>
          </div>
        )}

        {showVideo && (
          <div
            className="absolute inset-x-2 bottom-4 z-20"
            data-no-card-drag="true"
          >
            <input
              type="range"
              min={0}
              max={videoDuration || 0}
              step={0.1}
              value={Math.min(currentTime, videoDuration || 0)}
              onMouseDown={handleSeek}
              onPointerDown={(event) => event.stopPropagation()}
              onInput={(event) => {
                event.stopPropagation();
                const nextTime = Number(event.currentTarget.value);
                seekTo(nextTime);
              }}
              onChange={(event) => {
                event.stopPropagation();
                const nextTime = Number(event.currentTarget.value);
                seekTo(nextTime);
              }}
              className="h-[3px] w-full accent-primary"
            />
          </div>
        )}

        {hasTrimChanges && (
          <div
            className="absolute left-2 top-2 z-20 flex items-center gap-1"
            data-no-card-drag="true"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              size="sm"
              className="h-6 rounded-[6px] px-2 text-[10px]"
              disabled={isTrimming}
              onClick={handleTrimApply}
            >
              {isTrimming ? "Applying..." : "Apply"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 rounded-[6px] px-2 text-[10px]"
              disabled={isTrimming}
              onClick={handleTrimCancel}
            >
              Cancel
            </Button>
          </div>
        )}

        {trimmedOutputPath && (
          <div
            className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-[6px] bg-background/90 p-1"
            data-no-card-drag="true"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              size="sm"
              variant="ghost"
              draggable
              className="h-6 rounded-[6px] px-2 text-[10px]"
              onDragStart={handleTrimmedDragStart}
              onDragEnd={handleTrimmedDragEnd}
              title="Drag trimmed media"
            >
              Drag
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 rounded-[6px] px-2 text-[10px]"
              onClick={() => void revealItemInDir(trimmedOutputPath)}
            >
              Show
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 rounded-[6px] px-2 text-[10px] text-destructive hover:text-destructive"
              onClick={() => handleDeleteClick(trimmedOutputPath)}
            >
              Delete
            </Button>
          </div>
        )}

        <div
          className="absolute inset-x-2 bottom-0.5 z-20"
          data-no-card-drag="true"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div
            ref={trimBarRef}
            className="relative h-[3px] rounded-full bg-background/80"
            onClick={handleTrimBarClick}
          >
            <div
              className="pointer-events-none absolute bottom-0 top-0 rounded-full bg-primary/90"
              style={{
                left: `${trimRange.start * 100}%`,
                width: `${(trimRange.end - trimRange.start) * 100}%`,
              }}
            />
            <button
              type="button"
              className="absolute top-1/2 z-10 h-3 w-2 -translate-y-1/2 border border-background bg-primary shadow"
              style={{ left: `calc(${trimRange.start * 100}% - 6px)` }}
              onMouseDown={(event) => startTrimDrag("start", event)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label="Trim start handle"
            />
            <button
              type="button"
              className="absolute top-1/2 z-10 h-3 w-2 -translate-y-1/2 border border-background bg-primary shadow"
              style={{ left: `calc(${trimRange.end * 100}% - 6px)` }}
              onMouseDown={(event) => startTrimDrag("end", event)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label="Trim end handle"
            />
          </div>
        </div>

        {trimError && (
          <div className="absolute bottom-4 left-2 z-20 max-w-[70%] truncate rounded-[6px] bg-destructive/85 px-2 py-0.5 text-[10px] text-destructive-foreground">
            {trimError}
          </div>
        )}

        <div
          className={`pointer-events-none absolute left-2 z-20 max-w-[70%] truncate rounded-sm bg-black/35 px-2 py-0.5 text-xs font-medium text-white ${hasTrimChanges ? "top-10" : "top-2"}`}
        >
          {highlightText(file.filename, videoSearchText)}
        </div>

        <div
          className={`pointer-events-none absolute inset-x-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${showVideo ? "bottom-16" : "bottom-12"}`}
        >
          <div className="max-h-7 overflow-hidden">{renderTags(file.tags)}</div>
        </div>

        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-sm bg-background/80 shadow-sm hover:bg-background"
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              if (file.id == null) return;
              void openContextMenu(file, rect.right - 8, rect.bottom + 2);
            }}
            title="More actions"
          >
            <MoreHorizontal className="h-2 w-2" />
          </Button>
        </div>
      </div>
    );
  };

  const showEmptyState = !isLoading && videoFiles.length === 0;

  return (
    <div className="px-1 flex flex-col gap-1 h-[calc(100vh-32px)]">
      <GlobalAssetNavbar
        viewMode={viewModeVideo}
        onViewModeChange={setViewModeVideo}
        searchValue={videoSearchText}
        onSearchChange={(value) => setVideoSearch(value, tagFilter)}
        availableTags={availableTags}
        selectedTags={tagFilter}
        onSelectedTagsChange={setTagFilter}
        filteredCount={filteredAssetIds.length}
        selectedCount={selectedAssetIds.length}
        allFilteredSelected={allFilteredSelected}
        onSelectAll={selectAllFiltered}
        onEditSelected={openBulkTagsDialog}
        onDeleteSelected={handleBulkDeleteClick}
        onClearSelected={() => setSelectedAssetIds([])}
        hint="Hint: Right-click an item or use Shift+F10"
      />
      <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto">
        {showEmptyState ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {videoSearchText
              ? "No videos found matching your search"
              : "No video files found"}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: totalHeight || (isLoading ? rowHeight : 0) }}
          >
            {!!virtualItems.length &&
              virtualItems.map((virtualRow) => {
                if (viewModeVideo === "grid") {
                  const startIndex = virtualRow.index * gridColumns;
                  const files = Array.from(
                    { length: gridColumns },
                    (_, i) => videoFiles[startIndex + i],
                  ).filter(Boolean);

                  const gridColsClass =
                    gridColumns === 5
                      ? "grid-cols-5"
                      : gridColumns === 4
                        ? "grid-cols-4"
                        : gridColumns === 3
                          ? "grid-cols-3"
                          : "grid-cols-2";

                  return (
                    <div
                      key={virtualRow.key}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute left-0 right-0 pb-1"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className={`grid ${gridColsClass} gap-1`}>
                        {files.map((file) => (
                          <VideoCard
                            key={file.id}
                            file={file}
                            minHeight={rowHeight}
                          />
                        ))}
                      </div>
                    </div>
                  );
                }

                // List or Large mode: single column
                const file = videoFiles[virtualRow.index];
                if (!file) return null;

                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 right-0 pb-1"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <VideoCard
                      file={file}
                      minHeight={ITEM_HEIGHTS[viewModeVideo]}
                    />
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Fullscreen Video Modal */}
      {fullscreenVideo && (
        <div
          className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.4),rgba(0,0,0,0.95))] flex items-center justify-center p-1.5 sm:p-3"
          onClick={closeFullscreen}
        >
          <div
            className="relative w-full max-w-6xl max-h-[calc(100vh-0.75rem)] overflow-y-auto rounded-xl border border-white/15 bg-black/40 p-2 sm:max-h-[calc(100vh-1.5rem)] sm:p-3 shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2 pr-10 sm:pr-12">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white sm:text-sm">
                  {fullscreenVideo.filename}
                </p>
                <p className="text-[10px] text-white/70 sm:text-xs">
                  {formatVideoTime(fullscreenVideo.duration_sec)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full text-white hover:bg-white/20 sm:top-3 sm:right-3 sm:h-9 sm:w-9"
              onClick={closeFullscreen}
            >
              <span className="text-lg sm:text-xl">×</span>
            </Button>
            <video
              ref={fullscreenVideoRef}
              src={convertFileSrc(fullscreenVideo.original_path)}
              className="w-full max-h-[52vh] rounded-lg object-contain bg-black sm:max-h-[64vh] lg:max-h-[72vh]"
              autoPlay
              playsInline
              muted={isFullscreenMuted}
              onPlay={() => setIsFullscreenPlaying(true)}
              onPause={() => setIsFullscreenPlaying(false)}
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration || 0;
                setFullscreenDuration(duration);
              }}
              onTimeUpdate={(event) => {
                setFullscreenCurrentTime(event.currentTarget.currentTime || 0);
              }}
              onClick={handleFullscreenVideoClick}
            />

            <div className="mt-2 rounded-lg border border-white/15 bg-black/35 p-1.5 sm:mt-3 sm:p-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-xs"
                    variant="outline"
                    className="h-6 w-6 rounded-sm bg-background/80 sm:h-7 sm:w-7"
                    onClick={handleFullscreenTogglePlayback}
                    title={isFullscreenPlaying ? "Pause" : "Play"}
                  >
                    {isFullscreenPlaying ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="outline"
                    className="h-6 w-6 rounded-sm bg-background/80 sm:h-7 sm:w-7"
                    onClick={handleFullscreenToggleMute}
                    title={isFullscreenMuted ? "Unmute" : "Mute"}
                  >
                    {isFullscreenMuted ? (
                      <VolumeX className="h-3 w-3" />
                    ) : (
                      <Volume2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <div className="rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground/90 sm:text-[11px]">
                  {formatVideoTime(fullscreenCurrentTime)} /{" "}
                  {formatVideoTime(fullscreenDuration)}
                </div>
              </div>

              <div className="mb-1.5">
                <input
                  type="range"
                  min={0}
                  max={fullscreenDuration || 0}
                  step={0.1}
                  value={Math.min(
                    fullscreenCurrentTime,
                    fullscreenDuration || 0,
                  )}
                  onChange={(event) =>
                    seekFullscreenTo(Number(event.currentTarget.value))
                  }
                  className="h-[3px] w-full accent-primary"
                />
              </div>

              <div
                ref={fullscreenTrimBarRef}
                className="relative h-[3px] rounded-full bg-background/80"
                onClick={handleFullscreenTrimBarClick}
              >
                <div
                  className="pointer-events-none absolute bottom-0 top-0 rounded-full bg-primary/90"
                  style={{
                    left: `${fullscreenTrimRange.start * 100}%`,
                    width: `${(fullscreenTrimRange.end - fullscreenTrimRange.start) * 100}%`,
                  }}
                />
                <button
                  type="button"
                  className="absolute top-1/2 z-10 h-3 w-2 -translate-y-1/2 border border-background bg-primary shadow"
                  style={{
                    left: `calc(${fullscreenTrimRange.start * 100}% - 6px)`,
                  }}
                  onMouseDown={(event) =>
                    startFullscreenTrimDrag("start", event)
                  }
                  aria-label="Fullscreen trim start handle"
                />
                <button
                  type="button"
                  className="absolute top-1/2 z-10 h-3 w-2 -translate-y-1/2 border border-background bg-primary shadow"
                  style={{
                    left: `calc(${fullscreenTrimRange.end * 100}% - 6px)`,
                  }}
                  onMouseDown={(event) => startFullscreenTrimDrag("end", event)}
                  aria-label="Fullscreen trim end handle"
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1">
                {hasFullscreenTrimChanges && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 rounded-[6px] px-2 text-[11px]"
                      disabled={isFullscreenTrimming}
                      onClick={handleFullscreenTrimApply}
                    >
                      {isFullscreenTrimming ? "Applying..." : "Apply"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-[6px] px-2 text-[11px]"
                      disabled={isFullscreenTrimming}
                      onClick={handleFullscreenTrimCancel}
                    >
                      Cancel
                    </Button>
                  </>
                )}

                {fullscreenTrimmedOutputPath && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      draggable
                      className="h-7 rounded-[6px] px-2 text-[11px]"
                      onDragStart={handleFullscreenTrimmedDragStart}
                      onDragEnd={handleFullscreenTrimmedDragEnd}
                    >
                      Drag
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-[6px] px-2 text-[11px]"
                      onClick={() =>
                        void revealItemInDir(fullscreenTrimmedOutputPath)
                      }
                    >
                      Show
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-[6px] px-2 text-[11px] text-destructive hover:text-destructive"
                      onClick={() => void handleDeleteFullscreenTrimmed()}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>

              {fullscreenTrimError && (
                <div className="mt-2 rounded-[6px] bg-destructive/85 px-2 py-1 text-[11px] text-destructive-foreground">
                  {fullscreenTrimError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <TagsDialog
        open={tagsDialogOpen}
        onOpenChange={handleTagsDialogChange}
        assetIds={tagsDialogAssetIds}
        currentTags={tagsDialogCurrentTags}
        availableTags={availableTags}
        onTagsUpdated={handleTagsUpdated}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete
              {deleteTargets.length > 1
                ? ` ${deleteTargets.length} files`
                : " the file"}{" "}
              from your system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDeleteDialogChange(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename File</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for the file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleRenameConfirm();
              } else if (e.key === "Escape") {
                handleRenameCancel();
              }
            }}
            placeholder="New file name"
            className="mt-2"
            autoFocus
          />
          <AlertDialogFooter>
            <Button variant="outline" onClick={handleRenameCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={!newFileName.trim()}
            >
              Rename
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VideoPage;
