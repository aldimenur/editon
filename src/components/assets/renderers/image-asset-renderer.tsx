import ImageCard from "@/components/assets/image-card";
import {
  highlightSearchText as highlightImageSearchText,
  renderTagChips as renderImageTagChips,
} from "@/components/assets/utils/image-text";
import type { Asset } from "@/types/tauri";
import type { DragEvent as ReactDragEvent } from "react";

type ImageAssetRendererProps = {
  asset: Asset;
  isSelected: boolean;
  viewModeAssets: "list" | "grid" | "large";
  searchValue: string;
  onOpenContextMenu: (file: Asset, x: number, y: number) => void;
  onAssetDragStart: (
    event: ReactDragEvent<HTMLDivElement>,
    file: Asset,
  ) => void;
  onAssetDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  onOpenImagePreview: (file: Asset) => void;
};

export default function ImageAssetRenderer({
  asset,
  isSelected,
  viewModeAssets,
  searchValue,
  onOpenContextMenu,
  onAssetDragStart,
  onAssetDragEnd,
  onOpenImagePreview,
}: ImageAssetRendererProps) {
  return (
    <ImageCard
      file={asset}
      isSelected={isSelected}
      minHeight={viewModeAssets === "large" ? 320 : 220}
      isGrid={viewModeAssets === "grid"}
      gridItemHeight={0}
      gridAspectRatio={1}
      imageSearchText={searchValue}
      highlightText={highlightImageSearchText}
      renderTags={renderImageTagChips}
      onOpenContextMenu={onOpenContextMenu}
      onAssetDragStart={onAssetDragStart}
      onAssetDragEnd={onAssetDragEnd}
      onOpenPreview={onOpenImagePreview}
    />
  );
}
