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
import { MoreHorizontal } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import { Button } from "@/components/ui/button";
import useViewStore from "@/stores/view-store";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatFileSize } from "@/lib/utils";
import { applyDragImage, getDragPreviewIcon } from "@/lib/drag-preview";
import TagsDialog from "@/components/TagsDialog";
import GlobalAssetNavbar from "@/components/global-asset-navbar";
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
  const containerRef = useRef<HTMLDivElement | null>(null);
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
    const imageSrc = file.thumbnail_path
      ? convertFileSrc(file.thumbnail_path)
      : "";
    const isSelected = selectedAssetIds.includes(file.id ?? -1);

    return (
      <div
        key={file.id}
        className={`group relative border rounded-lg overflow-hidden bg-card transition-all hover:shadow-lg ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
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
          <img
            src={imageSrc}
            alt={file.filename}
            className="h-full w-full object-cover bg-muted cursor-pointer"
            loading="lazy"
            decoding="async"
            onClick={() => setSelectedImage(file)}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 px-2 pb-1 pt-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none">
          <div className="absolute inset-x-0 bottom-0 top-0 bg-linear-to-t from-background/95 via-background/70 to-transparent" />
          <div className="relative">
            <div className="text-xs font-medium truncate whitespace-nowrap">
              {highlightText(file.filename, imageSearchText)}
            </div>
            <div className="max-h-7 overflow-hidden">
              {renderTags(file.tags)}
            </div>
          </div>
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
      <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto">
        {showEmptyState ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {imageSearchText
              ? "No images found matching your search"
              : "No image files found"}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: totalHeight || (isLoading ? rowHeight : 0) }}
          >
            {!!virtualItems.length && (
              <div
                className={`absolute left-0 right-0 space-y-1`}
                style={{
                  transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  if (viewModeImage === "grid") {
                    const startIndex = virtualRow.index * gridColumns;
                    const files = Array.from(
                      { length: gridColumns },
                      (_, i) => imageFiles[startIndex + i],
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
                        key={virtualRow.index}
                        className={`grid ${gridColsClass} gap-1`}
                        style={{ minHeight: virtualRow.size }}
                      >
                        {files.map((file) =>
                          renderImageCard(file, rowHeight, true),
                        )}
                      </div>
                    );
                  } else {
                    // List or Large mode: single column
                    const file = imageFiles[virtualRow.index];
                    if (!file) return null;

                    return renderImageCard(file, virtualRow.size, false);
                  }
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3"
          onClick={closeModal}
        >
          <div
            className="relative max-w-7xl max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-10 w-10 text-white hover:bg-white/20 z-10"
              onClick={closeModal}
            >
              <span className="text-2xl">×</span>
            </Button>

            {/* Image */}
            <img
              src={convertFileSrc(selectedImage.original_path)}
              alt={selectedImage.filename}
              className="max-w-full max-h-[90vh] object-contain"
            />

            {/* Image Info Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white p-3">
              <p className="font-medium mb-1">{selectedImage.filename}</p>
              <div className="flex gap-3 text-sm text-gray-300">
                <span>
                  {selectedImage.metadata?.width &&
                  selectedImage.metadata?.height
                    ? `${selectedImage.metadata.width} × ${selectedImage.metadata.height}`
                    : "Unknown resolution"}
                </span>
                <span>{formatFileSize(selectedImage.file_size)}</span>
                {selectedImage.metadata?.color_space && (
                  <span>{selectedImage.metadata.color_space}</span>
                )}
                {selectedImage.metadata?.codec && (
                  <span>{selectedImage.metadata.codec.toUpperCase()}</span>
                )}
              </div>
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

export default ImagePage;
