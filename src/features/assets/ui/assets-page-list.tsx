import { useCallback, type DragEvent as ReactDragEvent } from "react";

import AssetTypeRenderer from "@/components/assets/asset-type-renderer";
import GlobalAssetList from "@/components/global-asset-list";
import type { Asset } from "@/types/tauri";

type ViewMode = "list" | "grid" | "large";

type AssetsPageListProps = {
  assets: Asset[];
  searchValue: string;
  viewModeAssets: ViewMode;
  selectedAssetIds: number[];
  isLoading: boolean;
  hasMore: boolean;
  sliderValue: number;
  onToggleSelection: (assetId: number) => void;
  onLoadMore: () => void;
  onOpenContextMenu: (asset: Asset, x: number, y: number) => void;
  onDeleteAsset: (path: string) => void;
  onDeleteTrimmed: (path: string) => void;
  onAssetDragStart: (
    event: ReactDragEvent<HTMLDivElement>,
    asset: Asset,
  ) => void;
  onAssetDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  onOpenImagePreview: (asset: Asset) => void;
  onOpenVideoPreview: (asset: Asset) => void;
  onTrimApplied: (outputPath: string) => void | Promise<void>;
};

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function AssetsPageList({
  assets,
  searchValue,
  viewModeAssets,
  selectedAssetIds,
  isLoading,
  hasMore,
  sliderValue,
  onToggleSelection,
  onLoadMore,
  onOpenContextMenu,
  onDeleteAsset,
  onDeleteTrimmed,
  onAssetDragStart,
  onAssetDragEnd,
  onOpenImagePreview,
  onOpenVideoPreview,
  onTrimApplied,
}: AssetsPageListProps) {
  const renderAsset = useCallback(
    (asset: Asset, isSelected: boolean) => (
      <AssetTypeRenderer
        asset={asset}
        isSelected={isSelected}
        viewModeAssets={viewModeAssets}
        searchValue={searchValue}
        sliderValue={sliderValue}
        onOpenContextMenu={onOpenContextMenu}
        onDeleteAsset={onDeleteAsset}
        onDeleteTrimmed={onDeleteTrimmed}
        onAssetDragStart={onAssetDragStart}
        onAssetDragEnd={onAssetDragEnd}
        onOpenImagePreview={onOpenImagePreview}
        onOpenVideoPreview={onOpenVideoPreview}
        onTrimApplied={onTrimApplied}
        formatVideoTime={formatVideoTime}
      />
    ),
    [
      onAssetDragEnd,
      onAssetDragStart,
      onDeleteAsset,
      onDeleteTrimmed,
      onOpenContextMenu,
      onOpenImagePreview,
      onOpenVideoPreview,
      onTrimApplied,
      searchValue,
      sliderValue,
      viewModeAssets,
    ],
  );

  return (
    <GlobalAssetList
      assets={assets}
      searchText={searchValue}
      viewMode={viewModeAssets}
      selectedIds={selectedAssetIds}
      isLoading={isLoading}
      hasMore={hasMore}
      onToggleSelect={onToggleSelection}
      onLoadMore={onLoadMore}
      renderAsset={renderAsset}
    />
  );
}
