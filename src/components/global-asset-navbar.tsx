import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SearchTagFilter from "@/components/search-tag-filter";
import ViewModeSelector from "@/components/view-mode-selector";
import useNavStore from "@/stores/nav-store";
import { SlidersHorizontal } from "lucide-react";

type ViewMode = "list" | "grid" | "large";

type GlobalAssetNavbarProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  availableTags: string[];
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
  filteredCount: number;
  selectedCount: number;
  allFilteredSelected: boolean;
  onSelectAll: () => void;
  onEditSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelected: () => void;
  className?: string;
  hint?: string;
  settingsExtra?: ReactNode;
};

export default function GlobalAssetNavbar({
  viewMode,
  onViewModeChange,
  searchValue,
  onSearchChange,
  availableTags,
  selectedTags,
  onSelectedTagsChange,
  filteredCount,
  selectedCount,
  allFilteredSelected,
  onSelectAll,
  onEditSelected,
  onDeleteSelected,
  onClearSelected,
  settingsExtra,
}: GlobalAssetNavbarProps) {
  const { isZenMode } = useNavStore();

  return (
    <div
      className={`${isZenMode ? "pl-16" : ""} flex items-center gap-1 h-8 mt-1`}
    >
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <SlidersHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <ViewModeSelector
              value={viewMode}
              onChange={onViewModeChange}
              compact
            />

            {(filteredCount > 0 || selectedCount > 0) && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Selection
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground min-w-6 text-center">
                      {selectedCount}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 px-1.5 text-[10px]"
                        >
                          Actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {filteredCount > 0 && (
                          <DropdownMenuItem
                            onClick={onSelectAll}
                            disabled={allFilteredSelected}
                          >
                            Select all filtered
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={onEditSelected}
                          disabled={selectedCount === 0}
                        >
                          Edit selected tags
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={onDeleteSelected}
                          disabled={selectedCount === 0}
                        >
                          Delete selected
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={onClearSelected}
                          disabled={selectedCount === 0}
                        >
                          Clear selection
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </>
            )}

            {settingsExtra && <DropdownMenuSeparator />}
            {settingsExtra}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SearchTagFilter
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onSelectedTagsChange={onSelectedTagsChange}
      />
    </div>
  );
}
