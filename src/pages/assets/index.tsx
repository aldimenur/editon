import {
  useCallback,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { startDrag } from "@crabnebula/tauri-plugin-drag";

import { applyDragImage, getDragPreviewIcon } from "@/lib/drag-preview";
import { useAvailableTags } from "@/hooks/use-available-tags";
import { getCommonTags } from "@/lib/tags";
import { ASSETS_PAGE_SIZE } from "@/features/assets/constants";
import { useAssetBulkActions } from "@/features/assets/hooks/use-asset-bulk-actions";
import { useAssetContextMenu } from "@/features/assets/hooks/use-asset-context-menu";
import { useAssetItemActions } from "@/features/assets/hooks/use-asset-item-actions";
import { useAssetsQuery } from "@/features/assets/hooks/use-assets-query";
import { useAssetSelection } from "@/features/assets/hooks/use-asset-selection";
import AssetsPageDialogs from "@/features/assets/ui/assets-page-dialogs";
import AssetsPageList from "@/features/assets/ui/assets-page-list";
import AssetsPageToolbar from "@/features/assets/ui/assets-page-toolbar";
import useAssetStore from "@/stores/asset-store";
import useNavStore from "@/stores/nav-store";
import useViewStore from "@/stores/view-store";
import type { Asset } from "@/types/tauri";

export default function AssetsPage() {
  const {
    parentPath,
    globalSearch,
    setGlobalSearch,
    globalFiles,
    globalSearchCount,
    isLoading,
    fetchGlobalAssets,
  } = useAssetStore((state) => state);
  const { activeAssetFilter } = useNavStore((state) => state);
  const { viewModeAssets, setViewModeAssets } = useViewStore((state) => state);

  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [tagsDialogAssetIds, setTagsDialogAssetIds] = useState<number[]>([]);
  const [tagsDialogCurrentTags, setTagsDialogCurrentTags] = useState<
    string | null
  >(null);
  const [sliderValue, setSliderValue] = useState(0.5);
  const [selectedImage, setSelectedImage] = useState<Asset | null>(null);

  const {
    selectedAssetIds,
    filteredAssetIds,
    allFilteredSelected,
    selectedAssets,
    selectAllFiltered,
    toggleSelection,
    clearSelection,
  } = useAssetSelection(globalFiles);

  const commonSelectedTags = useMemo(
    () => getCommonTags(selectedAssets),
    [selectedAssets],
  );

  const { searchValue, setSearchValue, tagFilter, setTagFilter } =
    useAssetsQuery({
      parentPath,
      activeAssetFilter,
      initialSearch: globalSearch,
      setGlobalSearch,
      fetchGlobalAssets,
      onResetSelection: clearSelection,
    });

  const { availableTags, refreshAvailableTags } = useAvailableTags(
    parentPath,
    setTagFilter,
  );
  const {
    refreshAssets,
    handleDeleteAsset,
    handleDeleteTrimmed,
    handleTrimApplied,
  } = useAssetItemActions({
    activeAssetFilter,
    fetchGlobalAssets,
  });

  const openTagsDialog = useCallback(
    (assetIds: number[], currentTags: string | null) => {
      setTagsDialogAssetIds(assetIds);
      setTagsDialogCurrentTags(currentTags);
      setTagsDialogOpen(true);
    },
    [],
  );

  const { handleDeleteSelected, handleEditSelected } = useAssetBulkActions({
    selectedAssets,
    selectedAssetIds,
    commonSelectedTags,
    clearSelection,
    refreshAssets,
    onOpenTagsDialog: openTagsDialog,
  });

  const { openContextMenu } = useAssetContextMenu({
    selectedAssetIds,
    toggleSelection,
    onEditTags: (assetId, currentTags) => {
      openTagsDialog([assetId], currentTags);
    },
    onDeleteAsset: handleDeleteAsset,
  });

  const hasMore = globalFiles.length < globalSearchCount;

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;

    const nextPage = Math.floor(globalFiles.length / ASSETS_PAGE_SIZE) + 1;
    void fetchGlobalAssets(nextPage, ASSETS_PAGE_SIZE, activeAssetFilter);
  }, [
    activeAssetFilter,
    fetchGlobalAssets,
    globalFiles.length,
    hasMore,
    isLoading,
  ]);

  const handleAssetDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, file: Asset) => {
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
        "Dragging media",
      );
      applyDragImage(event.dataTransfer, dragPreview, file.original_path);

      try {
        startDrag({
          item: [file.original_path],
          icon: dragPreview || file.original_path,
          mode: "copy",
        });
      } catch (error) {
        console.error("Failed to drag media:", error);
      }
    },
    [],
  );

  const handleAssetDragEnd = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const handleTagsDialogOpenChange = useCallback((open: boolean) => {
    setTagsDialogOpen(open);

    if (!open) {
      setTagsDialogAssetIds([]);
      setTagsDialogCurrentTags(null);
    }
  }, []);

  const handleTagsUpdated = useCallback(() => {
    void refreshAvailableTags();
    void refreshAssets();
    clearSelection();
  }, [clearSelection, refreshAssets, refreshAvailableTags]);

  return (
    <div className="flex h-[calc(100dvh-var(--chrome-h,32px))] flex-col gap-1 px-1">
      <AssetsPageToolbar
        viewModeAssets={viewModeAssets}
        onViewModeAssetsChange={setViewModeAssets}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
        availableTags={availableTags}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
        filteredCount={filteredAssetIds.length}
        selectedCount={selectedAssetIds.length}
        allFilteredSelected={allFilteredSelected}
        onSelectAllFiltered={selectAllFiltered}
        onEditSelected={handleEditSelected}
        onDeleteSelected={handleDeleteSelected}
        onClearSelected={clearSelection}
        sliderValue={sliderValue}
        onSliderValueChange={setSliderValue}
      />

      <AssetsPageList
        assets={globalFiles}
        searchValue={searchValue}
        viewModeAssets={viewModeAssets}
        selectedAssetIds={selectedAssetIds}
        isLoading={isLoading}
        hasMore={hasMore}
        sliderValue={sliderValue}
        onToggleSelection={toggleSelection}
        onLoadMore={loadMore}
        onOpenContextMenu={openContextMenu}
        onDeleteAsset={handleDeleteAsset}
        onDeleteTrimmed={handleDeleteTrimmed}
        onAssetDragStart={handleAssetDragStart}
        onAssetDragEnd={handleAssetDragEnd}
        onOpenImagePreview={setSelectedImage}
        onTrimApplied={handleTrimApplied}
      />

      <AssetsPageDialogs
        selectedImage={selectedImage}
        onCloseImagePreview={() => setSelectedImage(null)}
        tagsDialogOpen={tagsDialogOpen}
        onTagsDialogOpenChange={handleTagsDialogOpenChange}
        tagsDialogAssetIds={tagsDialogAssetIds}
        tagsDialogCurrentTags={tagsDialogCurrentTags}
        availableTags={availableTags}
        onTagsUpdated={handleTagsUpdated}
      />
    </div>
  );
}
