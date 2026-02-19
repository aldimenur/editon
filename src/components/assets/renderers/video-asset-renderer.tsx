import VideoCard from "@/components/assets/video-card";
import {
  highlightSearchText as highlightVideoSearchText,
  renderTagChips as renderVideoTagChips,
} from "@/components/assets/utils/video-text";
import type { Asset } from "@/types/tauri";
import type { DragEvent as ReactDragEvent } from "react";

type VideoAssetRendererProps = {
  asset: Asset;
  isSelected: boolean;
  viewModeAssets: "list" | "grid" | "large";
  searchValue: string;
  onOpenContextMenu: (file: Asset, x: number, y: number) => void;
  onDeleteAsset: (path: string) => void;
  onAssetDragStart: (
    event: ReactDragEvent<HTMLDivElement>,
    file: Asset,
  ) => void;
  onAssetDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  onOpenVideoPreview: (asset: Asset) => void;
  onTrimApplied: (outputPath: string) => void | Promise<void>;
  formatVideoTime: (seconds: number) => string;
};

export default function VideoAssetRenderer({
  asset,
  isSelected,
  viewModeAssets,
  searchValue,
  onOpenContextMenu,
  onDeleteAsset,
  onAssetDragStart,
  onAssetDragEnd,
  onOpenVideoPreview,
  onTrimApplied,
  formatVideoTime,
}: VideoAssetRendererProps) {
  return (
    <VideoCard
      file={asset}
      minHeight={viewModeAssets === "large" ? 320 : 220}
      viewModeVideo={viewModeAssets}
      gridItemHeight={0}
      gridAspectRatio={16 / 9}
      videoSearchText={searchValue}
      isSelected={isSelected}
      highlightText={highlightVideoSearchText}
      renderTags={renderVideoTagChips}
      formatVideoTime={formatVideoTime}
      onOpenContextMenu={onOpenContextMenu}
      onAssetDragStart={onAssetDragStart}
      onAssetDragEnd={onAssetDragEnd}
      onOpenFullscreen={onOpenVideoPreview}
      onDeleteClick={onDeleteAsset}
      onTrimApplied={onTrimApplied}
    />
  );
}
