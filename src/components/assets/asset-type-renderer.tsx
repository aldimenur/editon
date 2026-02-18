import AudioAssetRenderer from "@/components/assets/renderers/audio-asset-renderer";
import ImageAssetRenderer from "@/components/assets/renderers/image-asset-renderer";
import VideoAssetRenderer from "@/components/assets/renderers/video-asset-renderer";
import type { Asset } from "@/types/tauri";
import type { DragEvent as ReactDragEvent } from "react";

type ViewMode = "list" | "grid" | "large";

type AssetTypeRendererProps = {
  asset: Asset;
  isSelected: boolean;
  viewModeAssets: ViewMode;
  searchValue: string;
  sliderValue: number;
  onOpenContextMenu: (file: Asset, x: number, y: number) => void;
  onDeleteAsset: (path: string) => void;
  onDeleteTrimmed: (path: string) => void;
  onAssetDragStart: (
    event: ReactDragEvent<HTMLDivElement>,
    file: Asset,
  ) => void;
  onAssetDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  onOpenImagePreview: (file: Asset) => void;
  onTrimApplied: (outputPath: string) => void | Promise<void>;
  formatVideoTime: (seconds: number) => string;
};

export default function AssetTypeRenderer({
  asset,
  isSelected,
  viewModeAssets,
  searchValue,
  sliderValue,
  onOpenContextMenu,
  onDeleteAsset,
  onDeleteTrimmed,
  onAssetDragStart,
  onAssetDragEnd,
  onOpenImagePreview,
  onTrimApplied,
  formatVideoTime,
}: AssetTypeRendererProps) {
  if (asset.type_name === "audio") {
    return (
      <AudioAssetRenderer
        asset={asset}
        isSelected={isSelected}
        viewModeAssets={viewModeAssets}
        searchValue={searchValue}
        sliderValue={sliderValue}
        onOpenContextMenu={onOpenContextMenu}
        onDeleteTrimmed={onDeleteTrimmed}
        onTrimApplied={onTrimApplied}
      />
    );
  }

  if (asset.type_name === "video") {
    return (
      <VideoAssetRenderer
        asset={asset}
        isSelected={isSelected}
        viewModeAssets={viewModeAssets}
        searchValue={searchValue}
        onOpenContextMenu={onOpenContextMenu}
        onDeleteAsset={onDeleteAsset}
        onAssetDragStart={onAssetDragStart}
        onAssetDragEnd={onAssetDragEnd}
        onTrimApplied={onTrimApplied}
        formatVideoTime={formatVideoTime}
      />
    );
  }

  if (asset.type_name === "image") {
    return (
      <ImageAssetRenderer
        asset={asset}
        isSelected={isSelected}
        viewModeAssets={viewModeAssets}
        searchValue={searchValue}
        onOpenContextMenu={onOpenContextMenu}
        onAssetDragStart={onAssetDragStart}
        onAssetDragEnd={onAssetDragEnd}
        onOpenImagePreview={onOpenImagePreview}
      />
    );
  }

  return null;
}
