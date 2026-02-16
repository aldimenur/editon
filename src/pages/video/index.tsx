import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import useViewStore from "@/stores/view-store";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyDragImage, getDragPreviewIcon } from "@/lib/drag-preview";
import { trimMediaAction } from "@/lib/actions/trim-media";
import TagsDialog from "@/components/TagsDialog";
import GlobalAssetNavbar from "@/components/global-asset-navbar";
import VideoCard from "./components/video-card";
import VideoAssetList from "./components/video-asset-list";
import FullscreenVideoModal from "./components/fullscreen-video-modal";
import VideoCrudDialogs from "./components/video-crud-dialogs";
import { highlightSearchText, renderTagChips } from "./utils/text";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [tagsDialogAssetIds, setTagsDialogAssetIds] = useState<number[]>([]);
  const [tagsDialogCurrentTags, setTagsDialogCurrentTags] = useState<
    string | null
  >(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<Asset | null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);
  const fullscreenTrimBarRef = useRef<HTMLDivElement>(null);
  const [isFullscreenPlaying, setIsFullscreenPlaying] = useState(false);
  const [isFullscreenMuted, setIsFullscreenMuted] = useState(true);
  const [fullscreenCurrentTime, setFullscreenCurrentTime] = useState(0);
  const [fullscreenDuration, setFullscreenDuration] = useState(0);
  const [fullscreenTrimRange, setFullscreenTrimRange] = useState({
    start: 0,
    end: 1,
  });
  const [fullscreenTrimCursorRatio, setFullscreenTrimCursorRatio] = useState<
    number | null
  >(null);
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

  const highlightText = highlightSearchText;

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
    setFullscreenTrimCursorRatio(null);
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
    const distToStart = Math.abs(ratio - fullscreenTrimRange.start);
    const distToEnd = Math.abs(ratio - fullscreenTrimRange.end);
    setFullscreenTrimEdgeAtRatio(
      distToStart <= distToEnd ? "start" : "end",
      ratio,
    );
  };

  const setFullscreenTrimEdgeAtRatio = (
    edge: "start" | "end",
    ratio: number,
  ) => {
    setFullscreenTrimRange((prev) => {
      if (edge === "start") {
        const nextStart = clamp(ratio, 0, prev.end - FULLSCREEN_MIN_TRIM_WIDTH);
        return { ...prev, start: nextStart };
      }

      const nextEnd = clamp(ratio, prev.start + FULLSCREEN_MIN_TRIM_WIDTH, 1);
      return { ...prev, end: nextEnd };
    });
    setFullscreenTrimError(null);
  };

  useEffect(() => {
    if (!fullscreenVideo) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== "i" && key !== "o" && key !== "[" && key !== "]") return;

      event.preventDefault();
      const ratio =
        fullscreenTrimCursorRatio ??
        (fullscreenDuration > 0
          ? clamp(fullscreenCurrentTime / fullscreenDuration, 0, 1)
          : null);
      if (ratio == null) return;
      if (key === "i" || key === "[") {
        setFullscreenTrimEdgeAtRatio("start", ratio);
      } else {
        setFullscreenTrimEdgeAtRatio("end", ratio);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    fullscreenVideo,
    fullscreenCurrentTime,
    fullscreenDuration,
    fullscreenTrimCursorRatio,
  ]);

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

  const renderTags = renderTagChips;

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

  const renderVideoCard = (file: Asset, minHeight: number) => {
    const isSelected = selectedAssetIds.includes(file.id ?? -1);

    return (
      <VideoCard
        key={file.id}
        file={file}
        minHeight={minHeight}
        viewModeVideo={viewModeVideo}
        gridItemHeight={gridItemHeight}
        videoSearchText={videoSearchText}
        isSelected={isSelected}
        highlightText={highlightText}
        renderTags={renderTags}
        formatVideoTime={formatVideoTime}
        onOpenContextMenu={(targetFile, x, y) => {
          void openContextMenu(targetFile, x, y);
        }}
        onAssetDragStart={handleAssetDragStart}
        onAssetDragEnd={handleAssetDragEnd}
        onOpenFullscreen={setFullscreenVideo}
        onDeleteClick={handleDeleteClick}
      />
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
      <VideoAssetList
        containerRef={containerRef}
        showEmptyState={showEmptyState}
        videoSearchText={videoSearchText}
        totalHeight={totalHeight}
        isLoading={isLoading}
        rowHeight={rowHeight}
        virtualItems={virtualItems}
        viewModeVideo={viewModeVideo}
        gridColumns={gridColumns}
        videoFiles={videoFiles}
        measureElement={rowVirtualizer.measureElement}
        renderVideoCard={renderVideoCard}
      />

      <FullscreenVideoModal
        fullscreenVideo={fullscreenVideo}
        closeFullscreen={closeFullscreen}
        fullscreenContainerRef={fullscreenContainerRef}
        fullscreenVideoRef={fullscreenVideoRef}
        fullscreenTrimBarRef={fullscreenTrimBarRef}
        setFullscreenTrimCursorRatio={setFullscreenTrimCursorRatio}
        clamp={clamp}
        formatVideoTime={formatVideoTime}
        isFullscreenPlaying={isFullscreenPlaying}
        isFullscreenMuted={isFullscreenMuted}
        fullscreenCurrentTime={fullscreenCurrentTime}
        fullscreenDuration={fullscreenDuration}
        fullscreenTrimRange={fullscreenTrimRange}
        hasFullscreenTrimChanges={hasFullscreenTrimChanges}
        isFullscreenTrimming={isFullscreenTrimming}
        fullscreenTrimmedOutputPath={fullscreenTrimmedOutputPath}
        fullscreenTrimError={fullscreenTrimError}
        handleFullscreenVideoClick={handleFullscreenVideoClick}
        onFullscreenPlay={() => setIsFullscreenPlaying(true)}
        onFullscreenPause={() => setIsFullscreenPlaying(false)}
        onFullscreenLoadedMetadata={setFullscreenDuration}
        onFullscreenTimeUpdate={setFullscreenCurrentTime}
        handleFullscreenTogglePlayback={handleFullscreenTogglePlayback}
        handleFullscreenToggleMute={handleFullscreenToggleMute}
        seekFullscreenTo={seekFullscreenTo}
        handleFullscreenTrimBarClick={handleFullscreenTrimBarClick}
        startFullscreenTrimDrag={startFullscreenTrimDrag}
        handleFullscreenTrimApply={handleFullscreenTrimApply}
        handleFullscreenTrimCancel={handleFullscreenTrimCancel}
        handleFullscreenTrimmedDragStart={handleFullscreenTrimmedDragStart}
        handleFullscreenTrimmedDragEnd={handleFullscreenTrimmedDragEnd}
        handleDeleteFullscreenTrimmed={handleDeleteFullscreenTrimmed}
      />

      <TagsDialog
        open={tagsDialogOpen}
        onOpenChange={handleTagsDialogChange}
        assetIds={tagsDialogAssetIds}
        currentTags={tagsDialogCurrentTags}
        availableTags={availableTags}
        onTagsUpdated={handleTagsUpdated}
      />

      <VideoCrudDialogs
        deleteDialogOpen={deleteDialogOpen}
        deleteTargets={deleteTargets}
        onDeleteDialogChange={handleDeleteDialogChange}
        onDeleteConfirm={handleDeleteConfirm}
        renameDialogOpen={renameDialogOpen}
        setRenameDialogOpen={setRenameDialogOpen}
        newFileName={newFileName}
        setNewFileName={setNewFileName}
        onRenameConfirm={handleRenameConfirm}
        onRenameCancel={handleRenameCancel}
      />
    </div>
  );
};

export default VideoPage;
