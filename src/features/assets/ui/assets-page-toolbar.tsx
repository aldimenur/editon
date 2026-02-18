import { faVolumeHigh } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import GlobalAssetNavbar from "@/components/global-asset-navbar";
import { Slider } from "@/components/ui/slider";

type ViewMode = "list" | "grid" | "large";

type AssetsPageToolbarProps = {
  viewModeAssets: ViewMode;
  onViewModeAssetsChange: (mode: ViewMode) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  availableTags: string[];
  tagFilter: string[];
  onTagFilterChange: (tags: string[]) => void;
  filteredCount: number;
  selectedCount: number;
  allFilteredSelected: boolean;
  onSelectAllFiltered: () => void;
  onEditSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelected: () => void;
  sliderValue: number;
  onSliderValueChange: (value: number) => void;
};

export default function AssetsPageToolbar({
  viewModeAssets,
  onViewModeAssetsChange,
  searchValue,
  onSearchValueChange,
  availableTags,
  tagFilter,
  onTagFilterChange,
  filteredCount,
  selectedCount,
  allFilteredSelected,
  onSelectAllFiltered,
  onEditSelected,
  onDeleteSelected,
  onClearSelected,
  sliderValue,
  onSliderValueChange,
}: AssetsPageToolbarProps) {
  return (
    <GlobalAssetNavbar
      viewMode={viewModeAssets}
      onViewModeChange={onViewModeAssetsChange}
      searchValue={searchValue}
      onSearchChange={onSearchValueChange}
      availableTags={availableTags}
      selectedTags={tagFilter}
      onSelectedTagsChange={onTagFilterChange}
      filteredCount={filteredCount}
      selectedCount={selectedCount}
      allFilteredSelected={allFilteredSelected}
      onSelectAll={onSelectAllFiltered}
      onEditSelected={onEditSelected}
      onDeleteSelected={onDeleteSelected}
      onClearSelected={onClearSelected}
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
              onValueChange={(value) => onSliderValueChange(value[0])}
              className="flex-1"
            />
            <span className="text-[10px] w-8 text-right">
              {Math.round(sliderValue * 100)}%
            </span>
          </div>
        </div>
      }
    />
  );
}
