import useAssetStore from "@/stores/asset-store";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVolumeHigh } from "@fortawesome/free-solid-svg-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Slider } from "@/components/ui/slider";
import useViewStore from "@/stores/view-store";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TagsDialog from "@/components/TagsDialog";
import type { Asset } from "@/types/tauri";
import GlobalAssetNavbar from "@/components/global-asset-navbar";
import SfxAudioCard from "./components/sfx-audio-card";
import SfxAssetList from "./components/sfx-asset-list";
import SfxCrudDialogs from "./components/sfx-crud-dialogs";
import { highlightSearchText, renderTagChips } from "./utils/text";

const ITEM_HEIGHTS = {
  list: 42,
  grid: 52,
  large: 72,
};

const SfxPage = () => {
  const {
    sfxSearch,
    setSfxSearch,
    parentPath,
    sfxFiles,
    sfxSearchCount,
    isLoading,
    fetchSfxAssets,
    sfx,
  } = useAssetStore((state) => state);
  const [pageSize] = useState(40);
  const [sliderValue, setSliderValue] = useState(0.5);
  const [gridColumns, setGridColumns] = useState(2);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [tagsDialogAssetIds, setTagsDialogAssetIds] = useState<number[]>([]);
  const [tagsDialogCurrentTags, setTagsDialogCurrentTags] = useState<
    string | null
  >(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const appWindow = getCurrentWindow();
  const { viewModeAudio, setViewModeAudio } = useViewStore((state) => state);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasMore = sfxFiles.length < sfxSearchCount;
  const filteredAssetIds = sfxFiles
    .map((file) => file.id)
    .filter((id): id is number => typeof id === "number");
  const allFilteredSelected =
    filteredAssetIds.length > 0 &&
    filteredAssetIds.every((id) => selectedAssetIds.includes(id));

  // Track container width and update columns responsively
  useEffect(() => {
    if (!containerRef.current) return;

    const updateColumns = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;

      // Define breakpoints for responsive columns
      if (width >= 1600) {
        setGridColumns(5); // Extra large screens
      } else if (width >= 1200) {
        setGridColumns(4); // Large screens
      } else if (width >= 768) {
        setGridColumns(3); // Medium screens
      } else {
        setGridColumns(2); // Small screens
      }
    };

    const resizeObserver = new ResizeObserver(updateColumns);
    resizeObserver.observe(containerRef.current);
    updateColumns(); // Initial calculation

    return () => resizeObserver.disconnect();
  }, []);

  // initial load / path change
  useEffect(() => {
    if (!parentPath) {
      return;
    }
    fetchSfxAssets(1, pageSize, true);
  }, [parentPath, pageSize, sfx]);

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
  }, [parentPath, fetchAvailableTags]); // Refetch when path changes

  // search with debounce (including tag filter)
  useEffect(() => {
    if (!parentPath) return;

    const timeout = setTimeout(() => {
      setSfxSearch(sfxSearch.search, tagFilter);
      fetchSfxAssets(1, pageSize, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [sfxSearch.search, tagFilter, parentPath, pageSize]);

  // Calculate row count based on view mode
  const getRowCount = () => {
    if (viewModeAudio === "grid") {
      return Math.ceil(sfxFiles.length / gridColumns);
    }
    return sfxFiles.length;
  };

  const rowVirtualizer = useVirtualizer({
    count: getRowCount(),
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_HEIGHTS[viewModeAudio],
    getItemKey: (index) => `${viewModeAudio}-${gridColumns}-${index}`, // reset size cache when mode or columns change
    overscan: 10,
  });
  // compute virtual items once per render
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || sfxFiles.length === 0) return;
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // Calculate actual file index based on view mode
    const actualLastIndex =
      viewModeAudio === "grid"
        ? lastItem.index * gridColumns + (gridColumns - 1) // In grid mode, each row has gridColumns items
        : lastItem.index;

    // when we scroll within a few items of the end, load next page
    if (actualLastIndex >= sfxFiles.length - 5) {
      const nextPage = Math.floor(sfxFiles.length / pageSize) + 1;
      console.log("Loading next page:", nextPage);
      fetchSfxAssets(nextPage, pageSize);
    }
  }, [
    virtualItems.length,
    sfxFiles.length,
    hasMore,
    isLoading,
    pageSize,
    viewModeAudio,
    gridColumns,
  ]);

  // Reset scroll position when view mode or columns change
  useEffect(() => {
    rowVirtualizer.measure(); // force recalculation with new item heights
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewModeAudio, gridColumns]);

  const showEmptyState = !isLoading && sfxFiles.length === 0;

  const handleDeleteClick = (path: string) => {
    setDeleteTargets([path]);
    setDeleteDialogOpen(true);
  };

  const handleBulkDeleteClick = () => {
    const selectedPaths = sfxFiles
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
      fetchSfxAssets(1, pageSize, true);
    } catch (error) {
      console.error("Failed to delete file(s):", error);
    }
  };

  const handleRenameClick = (path: string, currentName: string) => {
    setFileToRename(path);
    // Extract name without extension
    const lastDotIndex = currentName.lastIndexOf(".");
    const nameWithoutExt =
      lastDotIndex > 0 ? currentName.substring(0, lastDotIndex) : currentName;
    setNewFileName(nameWithoutExt);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (fileToRename && newFileName.trim()) {
      try {
        // Get the original filename to extract the extension
        const originalFilename = fileToRename.split(/[\\/]/).pop() || "";
        const lastDotIndex = originalFilename.lastIndexOf(".");
        const extension =
          lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : "";

        // Append the extension to the new name
        const newFullName = newFileName.trim() + extension;

        await invoke("rename_file", {
          oldPath: fileToRename,
          newName: newFullName,
        });
        setRenameDialogOpen(false);
        setFileToRename(null);
        setNewFileName("");
        // Refresh the file list
        fetchSfxAssets(1, pageSize, true);
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

  const handleTagsClick = (assetId: number, tags: string | null) => {
    setTagsDialogAssetIds([assetId]);
    setTagsDialogCurrentTags(tags ?? null);
    setTagsDialogOpen(true);
  };

  const handleTagsUpdated = () => {
    fetchSfxAssets(1, pageSize, true);
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

  const openBulkTagsDialog = () => {
    const selectedAssets = sfxFiles.filter((file) =>
      typeof file.id === "number" ? selectedAssetIds.includes(file.id) : false,
    );
    setTagsDialogAssetIds(selectedAssetIds);
    setTagsDialogCurrentTags(getCommonTags(selectedAssets));
    setTagsDialogOpen(true);
  };

  const selectAllFiltered = () => {
    setSelectedAssetIds(filteredAssetIds);
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

  const highlightText = highlightSearchText;
  const renderTags = renderTagChips;

  const renderSfxCard = (
    file: Asset,
    waveHeight: number,
    showFileName: boolean,
  ) => {
    const isSelected = selectedAssetIds.includes(file.id ?? -1);

    return (
      <SfxAudioCard
        key={file.id}
        file={file}
        waveHeight={waveHeight}
        minHeight={ITEM_HEIGHTS[viewModeAudio]}
        showFileName={showFileName}
        searchText={sfxSearch.search}
        volume={sliderValue}
        isSelected={isSelected}
        onOpenContextMenu={(targetFile, x, y) => {
          void openContextMenu(targetFile, x, y);
        }}
        onDeleteTrimmed={handleDeleteClick}
        renderTags={renderTags}
        highlightText={highlightText}
      />
    );
  };

  return (
    <div className="px-1 flex flex-col gap-1 h-[calc(100vh-32px)]">
      <GlobalAssetNavbar
        viewMode={viewModeAudio}
        onViewModeChange={setViewModeAudio}
        searchValue={sfxSearch.search}
        onSearchChange={(value) => setSfxSearch(value, tagFilter)}
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
        settingsExtra={
          <div className="px-2 py-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Volume
            </p>
            <div className="flex items-center gap-1">
              <FontAwesomeIcon
                icon={faVolumeHigh}
                className="text-[10px]"
                fixedWidth
              />
              <Slider
                defaultValue={[sliderValue]}
                min={0}
                max={1}
                step={0.1}
                value={[sliderValue]}
                onValueChange={(value) => setSliderValue(value[0])}
                className="flex-1"
              />
              <span className="text-[10px] w-8 text-right">
                {Math.round(sliderValue * 100)}%
              </span>
            </div>
          </div>
        }
      />
      <SfxAssetList
        containerRef={containerRef}
        showEmptyState={showEmptyState}
        sfxSearchText={sfxSearch.search}
        totalHeight={totalHeight}
        isLoading={isLoading}
        itemHeight={ITEM_HEIGHTS[viewModeAudio]}
        virtualItems={virtualItems}
        viewModeAudio={viewModeAudio}
        gridColumns={gridColumns}
        sfxFiles={sfxFiles}
        measureElement={rowVirtualizer.measureElement}
        renderSfxCard={renderSfxCard}
      />

      <TagsDialog
        open={tagsDialogOpen}
        onOpenChange={handleTagsDialogChange}
        assetIds={tagsDialogAssetIds}
        currentTags={tagsDialogCurrentTags}
        availableTags={availableTags}
        onTagsUpdated={handleTagsUpdated}
      />

      <SfxCrudDialogs
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

export default SfxPage;
