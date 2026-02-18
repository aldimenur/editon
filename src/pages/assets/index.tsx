import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVolumeHigh } from "@fortawesome/free-solid-svg-icons";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { applyDragImage, getDragPreviewIcon } from "@/lib/drag-preview";
import TagsDialog from "@/components/TagsDialog";
import GlobalAssetList from "@/components/global-asset-list";
import GlobalAssetNavbar from "@/components/global-asset-navbar";
import { Slider } from "@/components/ui/slider";
import ImageCard from "@/pages/image/components/image-card";
import ImagePreviewModal from "@/pages/image/components/image-preview-modal";
import {
  highlightSearchText as highlightImageSearchText,
  renderTagChips as renderImageTagChips,
} from "@/pages/image/utils/text";
import SfxAudioCard from "@/pages/sfx/components/sfx-audio-card";
import {
  highlightSearchText as highlightSfxSearchText,
  renderTagChips as renderSfxTagChips,
} from "@/pages/sfx/utils/text";
import VideoCard from "@/pages/video/components/video-card";
import {
  highlightSearchText as highlightVideoSearchText,
  renderTagChips as renderVideoTagChips,
} from "@/pages/video/utils/text";
import useAssetStore from "@/stores/asset-store";
import useNavStore from "@/stores/nav-store";
import useViewStore from "@/stores/view-store";
import type { Asset } from "@/types/tauri";

const PAGE_SIZE = 40;

function parseTags(tags: string | null | undefined) {
  if (!tags) return [];
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

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

  const [searchValue, setSearchValue] = useState(globalSearch.search);
  const [tagFilter, setTagFilter] = useState<string[]>(globalSearch.tags);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [tagsDialogAssetIds, setTagsDialogAssetIds] = useState<number[]>([]);
  const [tagsDialogCurrentTags, setTagsDialogCurrentTags] = useState<
    string | null
  >(null);
  const [sliderValue, setSliderValue] = useState(0.5);
  const [selectedImage, setSelectedImage] = useState<Asset | null>(null);
  const appWindow = getCurrentWindow();

  const hasMore = globalFiles.length < globalSearchCount;
  const filteredAssetIds = globalFiles
    .map((file) => file.id)
    .filter((id): id is number => typeof id === "number");

  const allFilteredSelected =
    filteredAssetIds.length > 0 &&
    filteredAssetIds.every((id) => selectedAssetIds.includes(id));

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

  useEffect(() => {
    if (!parentPath) return;
    fetchAvailableTags();
  }, [parentPath, fetchAvailableTags]);

  useEffect(() => {
    if (!parentPath) return;
    setSelectedAssetIds([]);
    fetchGlobalAssets(1, PAGE_SIZE, activeAssetFilter, true);
  }, [parentPath, activeAssetFilter, fetchGlobalAssets]);

  useEffect(() => {
    if (!parentPath) return;

    const timeout = window.setTimeout(() => {
      setGlobalSearch(searchValue, tagFilter);
      fetchGlobalAssets(1, PAGE_SIZE, activeAssetFilter, true);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    parentPath,
    searchValue,
    tagFilter,
    activeAssetFilter,
    setGlobalSearch,
    fetchGlobalAssets,
  ]);

  const selectAllFiltered = () => {
    setSelectedAssetIds(filteredAssetIds);
  };

  const toggleSelection = (assetId: number) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId],
    );
  };

  const selectedAssets = useMemo(
    () =>
      globalFiles.filter((asset) =>
        typeof asset.id === "number"
          ? selectedAssetIds.includes(asset.id)
          : false,
      ),
    [globalFiles, selectedAssetIds],
  );

  const commonSelectedTags = useMemo(() => {
    if (selectedAssets.length === 0) return null;
    let common = parseTags(selectedAssets[0].tags);

    for (let i = 1; i < selectedAssets.length; i += 1) {
      const tagSet = new Set(parseTags(selectedAssets[i].tags));
      common = common.filter((tag) => tagSet.has(tag));
      if (common.length === 0) break;
    }

    return common.length > 0 ? common.join(", ") : null;
  }, [selectedAssets]);

  const handleDeleteSelected = async () => {
    if (selectedAssets.length === 0) return;
    try {
      for (const asset of selectedAssets) {
        await invoke("delete_file", { path: asset.original_path });
      }
      setSelectedAssetIds([]);
      fetchGlobalAssets(1, PAGE_SIZE, activeAssetFilter, true);
    } catch (error) {
      console.error("Failed to delete selected assets:", error);
    }
  };

  const handleEditSelected = () => {
    setTagsDialogAssetIds(selectedAssetIds);
    setTagsDialogCurrentTags(commonSelectedTags);
    setTagsDialogOpen(true);
  };

  const loadMore = () => {
    if (!hasMore || isLoading) return;
    const nextPage = Math.floor(globalFiles.length / PAGE_SIZE) + 1;
    fetchGlobalAssets(nextPage, PAGE_SIZE, activeAssetFilter);
  };

  const handleDeleteAsset = useCallback(
    async (path: string) => {
      try {
        await invoke("delete_file", { path });
        await fetchGlobalAssets(1, PAGE_SIZE, activeAssetFilter, true);
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    },
    [activeAssetFilter, fetchGlobalAssets],
  );

  const handleDeleteTrimmed = useCallback(async (path: string) => {
    try {
      await invoke("delete_file", { path });
    } catch (error) {
      console.error("Failed to delete trimmed file:", error);
    }
  }, []);

  const openContextMenu = useCallback(
    async (file: Asset, x: number, y: number) => {
      const fileId = file.id;
      if (typeof fileId !== "number") return;
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
            action: () => {
              setTagsDialogAssetIds([fileId]);
              setTagsDialogCurrentTags(file.tags ?? null);
              setTagsDialogOpen(true);
            },
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
            action: () => {
              void handleDeleteAsset(file.original_path);
            },
          },
        ],
      });

      try {
        await menu.popup(new LogicalPosition(x, y), appWindow);
      } finally {
        await menu.close();
      }
    },
    [appWindow, handleDeleteAsset, selectedAssetIds],
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
  };

  const handleAssetDragEnd = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const renderAsset = useCallback(
    (asset: Asset, isSelected: boolean) => {
      if (asset.type_name === "audio") {
        return (
          <SfxAudioCard
            file={asset}
            waveHeight={44}
            minHeight={84}
            showFileName={viewModeAssets !== "grid"}
            searchText={searchValue}
            volume={sliderValue}
            isSelected={isSelected}
            onOpenContextMenu={(targetFile, x, y) => {
              void openContextMenu(targetFile, x, y);
            }}
            onDeleteTrimmed={handleDeleteTrimmed}
            renderTags={renderSfxTagChips}
            highlightText={highlightSfxSearchText}
          />
        );
      }

      if (asset.type_name === "video") {
        const gridItemHeight = 0;

        return (
          <VideoCard
            file={asset}
            minHeight={viewModeAssets === "large" ? 320 : 220}
            viewModeVideo={viewModeAssets}
            gridItemHeight={gridItemHeight}
            gridAspectRatio={16 / 9}
            videoSearchText={searchValue}
            isSelected={isSelected}
            highlightText={highlightVideoSearchText}
            renderTags={renderVideoTagChips}
            formatVideoTime={formatVideoTime}
            onOpenContextMenu={(targetFile, x, y) => {
              void openContextMenu(targetFile, x, y);
            }}
            onAssetDragStart={handleAssetDragStart}
            onAssetDragEnd={handleAssetDragEnd}
            onOpenFullscreen={() => { }}
            onDeleteClick={(path) => {
              void handleDeleteAsset(path);
            }}
          />
        );
      }

      if (asset.type_name === "image") {
        const gridItemHeight = 0;

        return (
          <ImageCard
            file={asset}
            isSelected={isSelected}
            minHeight={viewModeAssets === "large" ? 320 : 220}
            isGrid={viewModeAssets === "grid"}
            gridItemHeight={gridItemHeight}
            gridAspectRatio={1}
            imageSearchText={searchValue}
            highlightText={highlightImageSearchText}
            renderTags={renderImageTagChips}
            onOpenContextMenu={(targetFile, x, y) => {
              void openContextMenu(targetFile, x, y);
            }}
            onAssetDragStart={handleAssetDragStart}
            onAssetDragEnd={handleAssetDragEnd}
            onOpenPreview={setSelectedImage}
          />
        );
      }

      return null;
    },
    [
      handleAssetDragEnd,
      handleAssetDragStart,
      handleDeleteAsset,
      handleDeleteTrimmed,
      openContextMenu,
      searchValue,
      sliderValue,
      viewModeAssets,
    ],
  );

  return (
    <div className="px-1 flex flex-col gap-1 h-[calc(100vh-32px)]">
      <GlobalAssetNavbar
        viewMode={viewModeAssets}
        onViewModeChange={setViewModeAssets}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        availableTags={availableTags}
        selectedTags={tagFilter}
        onSelectedTagsChange={setTagFilter}
        filteredCount={filteredAssetIds.length}
        selectedCount={selectedAssetIds.length}
        allFilteredSelected={allFilteredSelected}
        onSelectAll={selectAllFiltered}
        onEditSelected={handleEditSelected}
        onDeleteSelected={handleDeleteSelected}
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

      <GlobalAssetList
        assets={globalFiles}
        searchText={searchValue}
        viewMode={viewModeAssets}
        selectedIds={selectedAssetIds}
        isLoading={isLoading}
        hasMore={hasMore}
        onToggleSelect={toggleSelection}
        onLoadMore={loadMore}
        renderAsset={renderAsset}
      />

      <ImagePreviewModal
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
      />

      <TagsDialog
        open={tagsDialogOpen}
        onOpenChange={(open) => {
          setTagsDialogOpen(open);
          if (!open) {
            setTagsDialogAssetIds([]);
            setTagsDialogCurrentTags(null);
          }
        }}
        assetIds={tagsDialogAssetIds}
        currentTags={tagsDialogCurrentTags}
        availableTags={availableTags}
        onTagsUpdated={() => {
          fetchAvailableTags();
          fetchGlobalAssets(1, PAGE_SIZE, activeAssetFilter, true);
          setSelectedAssetIds([]);
        }}
      />
    </div>
  );
}
