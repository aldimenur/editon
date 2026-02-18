import SfxAudioCard from "@/components/assets/sfx-audio-card";
import {
  highlightSearchText as highlightSfxSearchText,
  renderTagChips as renderSfxTagChips,
} from "@/components/assets/utils/sfx-text";
import type { Asset } from "@/types/tauri";

type AudioAssetRendererProps = {
  asset: Asset;
  isSelected: boolean;
  viewModeAssets: "list" | "grid" | "large";
  searchValue: string;
  sliderValue: number;
  onOpenContextMenu: (file: Asset, x: number, y: number) => void;
  onDeleteTrimmed: (path: string) => void;
  onTrimApplied: (outputPath: string) => void | Promise<void>;
};

export default function AudioAssetRenderer({
  asset,
  isSelected,
  viewModeAssets,
  searchValue,
  sliderValue,
  onOpenContextMenu,
  onDeleteTrimmed,
  onTrimApplied,
}: AudioAssetRendererProps) {
  return (
    <SfxAudioCard
      file={asset}
      waveHeight={44}
      minHeight={84}
      showFileName={viewModeAssets !== "grid"}
      searchText={searchValue}
      volume={sliderValue}
      isSelected={isSelected}
      onOpenContextMenu={onOpenContextMenu}
      onDeleteTrimmed={onDeleteTrimmed}
      onTrimApplied={onTrimApplied}
      renderTags={renderSfxTagChips}
      highlightText={highlightSfxSearchText}
    />
  );
}
