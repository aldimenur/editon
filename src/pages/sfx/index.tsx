import useAssetStore from "@/stores/asset-store";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import WavesurferRender from "@/components/wavesurfer";
import { Input } from "@/components/ui/input";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faFolderOpen,
  faList,
  faMagnifyingGlass,
  faPenToSquare,
  faSliders,
  faTag,
  faTableCells,
  faTags,
  faTrashCan,
  faVolumeHigh,
  faExpand,
} from "@fortawesome/free-solid-svg-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import useViewStore from "@/stores/view-store";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TagsDialog from "@/components/TagsDialog";
import type { Asset } from "@/types/tauri";
import useNavStore from "@/stores/nav-store";

const ITEM_HEIGHTS = {
  list: 42,
  grid: 52,
  large: 72,
};

type SfxAudioCardProps = {
  file: Asset;
  waveHeight: number;
  minHeight: number;
  searchText: string;
  volume: number;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  onTagsClick: (id: number, tags: string | null) => void;
  onRenameClick: (path: string, currentName: string) => void;
  onDeleteClick: (path: string) => void;
  onReveal: (path: string) => void;
  renderTags: (tags: string | null) => ReactNode;
  highlightText: (text: string, search: string) => ReactNode;
};

const SfxAudioCard = ({
  file,
  minHeight,
  searchText,
  volume,
  isSelected,
  onToggleSelect,
  onTagsClick,
  onRenameClick,
  onDeleteClick,
  onReveal,
  renderTags,
  highlightText,
}: SfxAudioCardProps) => {
  const fileId = file.id as number;
  const isSelectedClass = isSelected
    ? "border-primary ring-1 ring-primary/30"
    : "border-border/60";

  return (
    <div
      className={`group relative border flex bg-background/70 rounded-[6px] transition-shadow hover:shadow-md ${isSelectedClass}`}
      style={{ minHeight, height: minHeight, width: "100%" }}
    >
      <div className="flex flex-col flex-1 h-full">
        <WavesurferRender
          src={file.original_path}
          waveform={file.waveform_data || []}
          volume={volume}
          height="100%"
          width={"100%"}
          enableDrag
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 pb-2 pt-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none">
        <div className="absolute inset-x-0 bottom-0 top-0 bg-linear-to-t from-background/95 via-background/80 to-transparent" />
        <div className="relative">
          <div className="text-[12px] font-semibold truncate whitespace-nowrap leading-none">
            {highlightText(file.filename, searchText)}
          </div>
          <div className="max-h-5 overflow-hidden">
            {renderTags(file.tags ?? null)}
          </div>
        </div>
      </div>
      <div className="absolute right-0 top-0 z-10 flex items-center gap-0.5 rounded-[6px] bg-background/90 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          variant={isSelected ? "default" : "ghost"}
          size="icon"
          className="h-6 w-6 rounded-[6px] bg-transparent p-0 shadow-none hover:bg-background/70 transition-opacity"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(fileId);
          }}
        >
          <FontAwesomeIcon icon={faCheck} className="text-[10px]" fixedWidth />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-[6px] bg-transparent p-0 shadow-none hover:bg-background/70"
          onClick={() => onTagsClick(fileId, file.tags ?? null)}
        >
          <FontAwesomeIcon icon={faTag} className="text-[10px]" fixedWidth />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-[6px] bg-transparent p-0 shadow-none hover:bg-background/70"
          onClick={() => onRenameClick(file.original_path, file.filename)}
        >
          <FontAwesomeIcon
            icon={faPenToSquare}
            className="text-[10px]"
            fixedWidth
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-[6px] bg-transparent p-0 shadow-none hover:bg-background/70"
          onClick={() => onReveal(file.original_path)}
        >
          <FontAwesomeIcon
            icon={faFolderOpen}
            className="text-[10px]"
            fixedWidth
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-[6px] bg-transparent p-0 shadow-none text-destructive hover:text-destructive hover:bg-background/70"
          onClick={() => onDeleteClick(file.original_path)}
        >
          <FontAwesomeIcon
            icon={faTrashCan}
            className="text-[10px]"
            fixedWidth
          />
        </Button>
      </div>
    </div>
  );
};

const SfxPage = () => {
  const {
    sfxSearch,
    setSfxSearch,
    parentPath,
    sfxFiles,
    sfxSearchCount,
    isLoading,
    fetchSfxAssets,
    sfx,
  } = useAssetStore((state) => state);
  const { isZenMode } = useNavStore()
  const [pageSize] = useState(40);
  const [sliderValue, setSliderValue] = useState(0.5);
  const [gridColumns, setGridColumns] = useState(2);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [tagsDialogAssetIds, setTagsDialogAssetIds] = useState<number[]>([]);
  const [tagsDialogCurrentTags, setTagsDialogCurrentTags] = useState<
    string | null
  >(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const { viewModeAudio, setViewModeAudio } = useViewStore((state) => state);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasMore = sfxFiles.length < sfxSearchCount;
  const filteredAssetIds = sfxFiles
    .map((file) => file.id)
    .filter((id): id is number => typeof id === "number");
  const allFilteredSelected =
    filteredAssetIds.length > 0 &&
    filteredAssetIds.every((id) => selectedAssetIds.includes(id));

  // Track container width and update columns responsively
  useEffect(() => {
    if (!containerRef.current) return;

    const updateColumns = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;

      // Define breakpoints for responsive columns
      if (width >= 1600) {
        setGridColumns(5); // Extra large screens
      } else if (width >= 1200) {
        setGridColumns(4); // Large screens
      } else if (width >= 768) {
        setGridColumns(3); // Medium screens
      } else {
        setGridColumns(2); // Small screens
      }
    };

    const resizeObserver = new ResizeObserver(updateColumns);
    resizeObserver.observe(containerRef.current);
    updateColumns(); // Initial calculation

    return () => resizeObserver.disconnect();
  }, []);

  // initial load / path change
  useEffect(() => {
    if (!parentPath) {
      return;
    }
    fetchSfxAssets(1, pageSize, true);
  }, [parentPath, pageSize, sfx]);

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
  }, [parentPath, fetchAvailableTags]); // Refetch when path changes

  // search with debounce (including tag filter)
  useEffect(() => {
    if (!parentPath) return;

    const timeout = setTimeout(() => {
      setSfxSearch(sfxSearch.search, { tags: tagFilter.join(" ") });
      fetchSfxAssets(1, pageSize, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [sfxSearch.search, tagFilter, parentPath, pageSize]);

  // Calculate row count based on view mode
  const getRowCount = () => {
    if (viewModeAudio === "grid") {
      return Math.ceil(sfxFiles.length / gridColumns);
    }
    return sfxFiles.length;
  };

  const rowVirtualizer = useVirtualizer({
    count: getRowCount(),
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_HEIGHTS[viewModeAudio],
    getItemKey: (index) => `${viewModeAudio}-${gridColumns}-${index}`, // reset size cache when mode or columns change
    overscan: 10,
  });
  // compute virtual items once per render
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || sfxFiles.length === 0) return;
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // Calculate actual file index based on view mode
    const actualLastIndex =
      viewModeAudio === "grid"
        ? lastItem.index * gridColumns + (gridColumns - 1) // In grid mode, each row has gridColumns items
        : lastItem.index;

    // when we scroll within a few items of the end, load next page
    if (actualLastIndex >= sfxFiles.length - 5) {
      const nextPage = Math.floor(sfxFiles.length / pageSize) + 1;
      console.log("Loading next page:", nextPage);
      fetchSfxAssets(nextPage, pageSize);
    }
  }, [
    virtualItems.length,
    sfxFiles.length,
    hasMore,
    isLoading,
    pageSize,
    viewModeAudio,
    gridColumns,
  ]);

  // Reset scroll position when view mode or columns change
  useEffect(() => {
    rowVirtualizer.measure(); // force recalculation with new item heights
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewModeAudio, gridColumns]);

  const showEmptyState = !isLoading && sfxFiles.length === 0;

  const handleDeleteClick = (path: string) => {
    setFileToDelete(path);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (fileToDelete) {
      await invoke("delete_file", { path: fileToDelete });
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    }
  };

  const handleRenameClick = (path: string, currentName: string) => {
    setFileToRename(path);
    // Extract name without extension
    const lastDotIndex = currentName.lastIndexOf(".");
    const nameWithoutExt =
      lastDotIndex > 0 ? currentName.substring(0, lastDotIndex) : currentName;
    setNewFileName(nameWithoutExt);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (fileToRename && newFileName.trim()) {
      try {
        // Get the original filename to extract the extension
        const originalFilename = fileToRename.split(/[\\/]/).pop() || "";
        const lastDotIndex = originalFilename.lastIndexOf(".");
        const extension =
          lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : "";

        // Append the extension to the new name
        const newFullName = newFileName.trim() + extension;

        await invoke("rename_file", {
          oldPath: fileToRename,
          newName: newFullName,
        });
        setRenameDialogOpen(false);
        setFileToRename(null);
        setNewFileName("");
        // Refresh the file list
        fetchSfxAssets(1, pageSize, true);
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

  const handleTagsClick = (assetId: number, tags: string | null) => {
    setTagsDialogAssetIds([assetId]);
    setTagsDialogCurrentTags(tags ?? null);
    setTagsDialogOpen(true);
  };

  const handleTagsUpdated = () => {
    fetchSfxAssets(1, pageSize, true);
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
    const selectedAssets = sfxFiles.filter((file) =>
      selectedAssetIds.includes(file.id as any),
    );
    setTagsDialogAssetIds(selectedAssetIds);
    setTagsDialogCurrentTags(getCommonTags(selectedAssets));
    setTagsDialogOpen(true);
  };

  const selectAllFiltered = () => {
    setSelectedAssetIds(filteredAssetIds);
  };

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;

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

  const renderTags = (tags: string | null) => {
    if (!tags) return null;
    const tagArray = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (tagArray.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-0.5 mt-0.5">
        {tagArray.slice(0, 3).map((tag, index) => (
          <span
            key={index}
            className="bg-primary/10 text-primary px-2 py-0.5 rounded-[6px] text-[9px] leading-none"
          >
            {tag}
          </span>
        ))}
        {tagArray.length > 3 && (
          <span className="text-muted-foreground text-[10px]">
            +{tagArray.length - 3}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="px-1 flex flex-col gap-1 h-[calc(100vh-32px)]">
      <div className={`${isZenMode ? "ml-16 mt-1" : null} flex items-center gap-1 h-8`}>
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <FontAwesomeIcon
                  icon={faSliders}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>View Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* View Mode Section */}
              <div className="px-2 py-1">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">
                  View Mode
                </p>
                <div className="flex gap-0.5">
                  <Button
                    variant={viewModeAudio === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeAudio("list")}
                    className="flex-1 h-5 text-[10px]"
                  >
                    <FontAwesomeIcon
                      icon={faList}
                      className="text-[10px] mr-1"
                      fixedWidth
                    />
                    List
                  </Button>
                  <Button
                    variant={viewModeAudio === "grid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeAudio("grid")}
                    className="flex-1 h-5 text-[10px]"
                  >
                    <FontAwesomeIcon
                      icon={faTableCells}
                      className="text-[10px] mr-1"
                      fixedWidth
                    />
                    Grid
                  </Button>
                  <Button
                    variant={viewModeAudio === "large" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeAudio("large")}
                    className="flex-1 h-5 text-[10px]"
                  >
                    <FontAwesomeIcon
                      icon={faExpand}
                      className="text-[10px] mr-1"
                      fixedWidth
                    />
                    Large
                  </Button>
                </div>
              </div>

              {(filteredAssetIds.length > 0 || selectedAssetIds.length > 0) && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">
                      Selection
                    </p>
                    <div className="flex items-center gap-0.5">
                      {filteredAssetIds.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={selectAllFiltered}
                          disabled={allFilteredSelected}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          Select All
                        </Button>
                      )}
                      {selectedAssetIds.length > 0 && (
                        <>
                          <span className="text-[10px] text-muted-foreground">
                            {selectedAssetIds.length}
                          </span>
                          <Button
                            size="sm"
                            onClick={openBulkTagsDialog}
                            className="h-5 px-1.5 text-[10px]"
                          >
                            Edit Tags
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedAssetIds([])}
                            className="h-5 px-1.5 text-[10px]"
                          >
                            Clear
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              <DropdownMenuSeparator />

              {/* Volume Section */}
              <div className="px-2 py-1">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative flex-1 h-8 flex items-center min-w-[140px]">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]"
            fixedWidth
          />
          <Input
            type="text"
            placeholder="Search..."
            value={sfxSearch.search}
            onChange={(e) =>
              setSfxSearch(e.target.value, { tags: tagFilter.join(" ") })
            }
            className="pl-6 pr-7 text-[11px] h-8 py-0 leading-none"
          />
        </div>

        {/* Tag Filter */}
        {availableTags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-0.5 h-5 px-1.5 text-[10px] shrink-0"
              >
                <FontAwesomeIcon
                  icon={faTags}
                  className="text-[10px]"
                  fixedWidth
                />
                {tagFilter.length > 0
                  ? `${tagFilter.length} selected`
                  : "Filter"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by Tags</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={tagFilter.length === 0}
                onCheckedChange={() => setTagFilter([])}
              >
                All Tags
              </DropdownMenuCheckboxItem>
              {availableTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={tagFilter.includes(tag)}
                  onCheckedChange={() => {
                    if (tagFilter.includes(tag)) {
                      setTagFilter(tagFilter.filter((t) => t !== tag));
                    } else {
                      setTagFilter([...tagFilter, tag]);
                    }
                  }}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {showEmptyState ? (
          <div className="text-center text-muted-foreground py-4 text-[11px] border border-dashed border-border/60 rounded-[6px] bg-muted/10">
            {sfxSearch
              ? "No files found matching your search"
              : "No sound files found"}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{
              height:
                totalHeight || (isLoading ? ITEM_HEIGHTS[viewModeAudio] : 0),
            }}
          >
            {!!virtualItems.length && (
              <div
                className="absolute left-0 right-0 space-y-1"
                style={{
                  transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  if (viewModeAudio === "grid") {
                    // Grid mode: dynamic columns based on screen width
                    const startIndex = virtualRow.index * gridColumns;
                    const files = Array.from(
                      { length: gridColumns },
                      (_, i) => sfxFiles[startIndex + i],
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
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className={`grid ${gridColsClass} gap-1`}
                        style={{ minHeight: virtualRow.size }}
                      >
                        {files.map((file) => (
                          <SfxAudioCard
                            key={file.id}
                            file={file}
                            waveHeight={36}
                            minHeight={ITEM_HEIGHTS[viewModeAudio]}
                            searchText={sfxSearch.search}
                            volume={sliderValue}
                            isSelected={selectedAssetIds.includes(
                              file.id as number,
                            )}
                            onToggleSelect={toggleSelection}
                            onTagsClick={handleTagsClick}
                            onRenameClick={handleRenameClick}
                            onDeleteClick={handleDeleteClick}
                            onReveal={revealItemInDir}
                            renderTags={renderTags}
                            highlightText={highlightText}
                          />
                        ))}
                      </div>
                    );
                  } else {
                    // List or Large mode: single column
                    const file = sfxFiles[virtualRow.index];
                    if (!file) return null;

                    const waveHeight = viewModeAudio === "large" ? 56 : 32;
                    return (
                      <div
                        key={file.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                      >
                        <SfxAudioCard
                          file={file}
                          waveHeight={waveHeight}
                          minHeight={ITEM_HEIGHTS[viewModeAudio]}
                          searchText={sfxSearch.search}
                          volume={sliderValue}
                          isSelected={selectedAssetIds.includes(
                            file.id as number,
                          )}
                          onToggleSelect={toggleSelection}
                          onTagsClick={handleTagsClick}
                          onRenameClick={handleRenameClick}
                          onDeleteClick={handleDeleteClick}
                          onReveal={revealItemInDir}
                          renderTags={renderTags}
                          highlightText={highlightText}
                        />
                      </div>
                    );
                  }
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <TagsDialog
        open={tagsDialogOpen}
        onOpenChange={handleTagsDialogChange}
        assetIds={tagsDialogAssetIds}
        currentTags={tagsDialogCurrentTags}
        availableTags={availableTags}
        onTagsUpdated={handleTagsUpdated}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              file from your system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="h-6 px-2 text-[11px]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              className="h-6 px-2 text-[11px]"
            >
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
            <Button
              variant="outline"
              onClick={handleRenameCancel}
              className="h-6 px-2 text-[11px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={!newFileName.trim()}
              className="h-6 px-2 text-[11px]"
            >
              Rename
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SfxPage;
