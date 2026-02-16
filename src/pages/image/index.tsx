import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
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
import TagsDialog from "@/components/TagsDialog";
import GlobalAssetNavbar from "@/components/global-asset-navbar";
import ImageCard from "./components/image-card";
import ImageAssetList from "./components/image-asset-list";
import ImagePreviewModal from "./components/image-preview-modal";
import ImageCrudDialogs from "./components/image-crud-dialogs";
import { highlightSearchText, renderTagChips } from "./utils/text";

const ITEM_HEIGHTS = {
  list: 240,
  grid: 280,
  large: 400,
};

const ImagePage = () => {
  const {
    imageSearch,
    setImageSearch,
    parentPath,
    imageFiles,
    imageSearchCount,
    isLoading,
    fetchImageAssets,
    image,
  } = useAssetStore((state) => state);

  const [pageSize] = useState(30);
  const { viewModeImage, setViewModeImage } = useViewStore((state) => state);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedImage, setSelectedImage] = useState<Asset | null>(null);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [tagsDialogAssetIds, setTagsDialogAssetIds] = useState<number[]>([]);
  const [tagsDialogCurrentTags, setTagsDialogCurrentTags] = useState<
    string | null
  >(null);
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
  const filteredAssetIds = imageFiles
    .map((file) => file.id)
    .filter((id): id is number => typeof id === "number");
  const allFilteredSelected =
    filteredAssetIds.length > 0 &&
    filteredAssetIds.every((id) => selectedAssetIds.includes(id));
  const hasMore = imageFiles.length < imageSearchCount;
  const imageSearchText = imageSearch.search;

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
    fetchImageAssets(1, pageSize, true);
  }, [parentPath, pageSize]);

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

  // search with debounce
  useEffect(() => {
    if (!parentPath) return;

    const timeout = setTimeout(() => {
      setImageSearch(imageSearchText, tagFilter);
      fetchImageAssets(1, pageSize, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [imageSearchText, tagFilter, parentPath, pageSize, image]);

  // Calculate row count based on view mode
  const getRowCount = () => {
    if (viewModeImage === "grid") {
      return Math.ceil(imageFiles.length / gridColumns);
    }
    return imageFiles.length;
  };

  const rowHeight =
    viewModeImage === "grid" ? gridItemHeight : ITEM_HEIGHTS[viewModeImage];

  const rowVirtualizer = useVirtualizer({
    count: getRowCount(),
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => `${viewModeImage}-${gridColumns}-${index}`, // reset size cache when mode or columns change
    overscan: 10,
  });

  // compute virtual items once per render
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || imageFiles.length === 0) return;
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // Calculate actual file index based on view mode
    const actualLastIndex =
      viewModeImage === "grid"
        ? lastItem.index * gridColumns + (gridColumns - 1)
        : lastItem.index;

    // when we scroll within a few items of the end, load next page
    if (actualLastIndex >= imageFiles.length - 5) {
      const nextPage = Math.floor(imageFiles.length / pageSize) + 1;
      fetchImageAssets(nextPage, pageSize);
    }
  }, [
    virtualItems.length,
    imageFiles.length,
    hasMore,
    isLoading,
    pageSize,
    viewModeImage,
    gridColumns,
  ]);

  // Reset scroll position when view mode changes
  useEffect(() => {
    rowVirtualizer.measure(); // force recalculation with new item heights
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewModeImage, gridColumns]);

  const closeModal = () => {
    setSelectedImage(null);
  };

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
    fetchImageAssets(1, pageSize, true);
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
    const selectedAssets = imageFiles.filter((file) =>
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
    const selectedPaths = imageFiles
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
      fetchImageAssets(1, pageSize, true);
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
        fetchImageAssets(1, pageSize, true);
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
    event.preventDefault();
    event.stopPropagation();

    const dragPreview = getDragPreviewIcon(
      file.original_path,
      "Dragging image",
    );
    applyDragImage(event.dataTransfer, dragPreview, file.original_path);

    try {
      startDrag({
        item: [file.original_path],
        icon: dragPreview || file.original_path,
        mode: "copy",
      });
    } catch (error) {
      console.error("Failed to drag image:", error);
    }
  };

  const handleAssetDragEnd = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const renderImageCard = (file: Asset, minHeight: number, isGrid: boolean) => {
    const isSelected = selectedAssetIds.includes(file.id ?? -1);

    return (
      <ImageCard
        key={file.id}
        file={file}
        isSelected={isSelected}
        minHeight={minHeight}
        isGrid={isGrid}
        gridItemHeight={gridItemHeight}
        imageSearchText={imageSearchText}
        highlightText={highlightText}
        renderTags={renderTags}
        onOpenContextMenu={(targetFile, x, y) => {
          void openContextMenu(targetFile, x, y);
        }}
        onAssetDragStart={handleAssetDragStart}
        onAssetDragEnd={handleAssetDragEnd}
        onOpenPreview={setSelectedImage}
      />
    );
  };

  const showEmptyState = !isLoading && imageFiles.length === 0;

  return (
    <div className="px-1 flex flex-col gap-1 h-[calc(100vh-32px)]">
      <GlobalAssetNavbar
        viewMode={viewModeImage}
        onViewModeChange={setViewModeImage}
        searchValue={imageSearchText}
        onSearchChange={(value) => setImageSearch(value, tagFilter)}
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
      <ImageAssetList
        containerRef={containerRef}
        showEmptyState={showEmptyState}
        imageSearchText={imageSearchText}
        totalHeight={totalHeight}
        isLoading={isLoading}
        rowHeight={rowHeight}
        virtualItems={virtualItems}
        viewModeImage={viewModeImage}
        gridColumns={gridColumns}
        imageFiles={imageFiles}
        renderImageCard={renderImageCard}
      />

      <ImagePreviewModal image={selectedImage} onClose={closeModal} />

      <TagsDialog
        open={tagsDialogOpen}
        onOpenChange={handleTagsDialogChange}
        assetIds={tagsDialogAssetIds}
        currentTags={tagsDialogCurrentTags}
        availableTags={availableTags}
        onTagsUpdated={handleTagsUpdated}
      />

      <ImageCrudDialogs
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

export default ImagePage;
