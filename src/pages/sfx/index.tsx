import useAssetStore from "@/stores/asset-store";
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useEffect, useRef, useState } from "react";
import WavesurferRender from "@/components/wavesurfer";
import { Input } from "@/components/ui/input";
import { Search, Volume2, LayoutList, LayoutGrid, Maximize2, FolderSearch, MoreHorizontal, Settings2, PencilLine, Trash } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import useViewStore from "@/stores/view-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { invoke } from "@tauri-apps/api/core";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const ITEM_HEIGHTS = {
  list: 110,
  grid: 110,
  large: 140,
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
    sfx
  } = useAssetStore((state) => state);

  const [pageSize] = useState(40);
  const [sliderValue, setSliderValue] = useState(0.5);
  const [gridColumns, setGridColumns] = useState(2);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const { viewModeAudio, setViewModeAudio } = useViewStore((state) => state);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasMore = sfxFiles.length < sfxSearchCount;

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

  // search with debounce
  useEffect(() => {
    if (!parentPath) return;

    const timeout = setTimeout(() => {
      fetchSfxAssets(1, pageSize, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [sfxSearch, parentPath, pageSize]);


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

  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || sfxFiles.length === 0) return;

    const virtualItems = rowVirtualizer.getVirtualItems();
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // Calculate actual file index based on view mode
    const actualLastIndex = viewModeAudio === "grid"
      ? (lastItem.index * gridColumns) + (gridColumns - 1)  // In grid mode, each row has gridColumns items
      : lastItem.index;

    // when we scroll within a few items of the end, load next page
    if (actualLastIndex >= sfxFiles.length - 5) {
      const nextPage = Math.floor(sfxFiles.length / pageSize) + 1;
      console.log("Loading next page:", nextPage);
      fetchSfxAssets(nextPage, pageSize);
    }
  }, [rowVirtualizer.getVirtualItems(), sfxFiles.length, hasMore, isLoading, pageSize, viewModeAudio, fetchSfxAssets]);

  // Reset scroll position when view mode or columns change
  useEffect(() => {
    rowVirtualizer.measure(); // force recalculation with new item heights
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewModeAudio, gridColumns, rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

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
    const lastDotIndex = currentName.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? currentName.substring(0, lastDotIndex) : currentName;
    setNewFileName(nameWithoutExt);
    setRenameDialogOpen(true);
  };

  // Auto-focus and select text in rename input
  useEffect(() => {
    if (renameDialogOpen && renameInputRef.current) {
      // Use setTimeout to ensure the dialog is fully rendered
      setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 0);
    }
  }, [renameDialogOpen]);

  const handleRenameConfirm = async () => {
    if (fileToRename && newFileName.trim()) {
      try {
        // Get the original filename to extract the extension
        const originalFilename = fileToRename.split(/[\\/]/).pop() || "";
        const lastDotIndex = originalFilename.lastIndexOf('.');
        const extension = lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : "";

        // Append the extension to the new name
        const newFullName = newFileName.trim() + extension;

        await invoke("rename_file", {
          oldPath: fileToRename,
          newName: newFullName
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

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;

    // Tokenize search query: split by whitespace
    const tokens = search
      .split(/\s+/)
      .filter(token => token.trim().length > 0)
      .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex special chars

    if (tokens.length === 0) return text;

    // Create regex pattern that matches any token
    const pattern = new RegExp(`(${tokens.join('|')})`, 'gi');
    const parts = text.split(pattern);

    return (
      <>
        {parts.map((part, index) => {
          // Check if this part matches any of the search tokens
          const isMatch = tokens.some(
            token => part.toLowerCase() === token.toLowerCase()
          );

          return isMatch ? (
            <mark key={index} className="bg-yellow-300 dark:bg-yellow-600 text-foreground">
              {part}
            </mark>
          ) : (
            part
          );
        })}
      </>
    );
  };

  const renderAudioCard = (file: any, waveHeight: number, minHeight: number) => {
    return (
      <div
        key={file.id}
        className="border-2 rounded-lg flex"
        style={{ height: minHeight, width: "100%" }}
      >
        <div className="h-full flex flex-col flex-1 bg-accent">
          <div className="grid grid-cols-3">
            <p className="text-xs font-medium p-1 flex-1 truncate whitespace-nowrap pb-2 col-span-2 my-auto">
              {highlightText(file.filename, sfxSearch)}
            </p>
            <Button variant="ghost" size="icon-sm" className="justify-self-end">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex justify-center items-center h-full bg-background">
            <WavesurferRender
              src={file.original_path}
              waveform={file.waveform_data || []}
              volume={sliderValue}
              height={waveHeight}
              width={"100%"}
            />
          </div>
        </div>
        <div className="px-2 bg-accent/50 flex">
          <div className="mt-2 flex flex-col justify-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => handleRenameClick(file.original_path, file.filename)}>
              <PencilLine className="h-2 w-2" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => revealItemInDir(file.original_path)}>
              <FolderSearch className="h-2 w-2" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteClick(file.original_path)}>
              <Trash className="h-2 w-2 text-red-500" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-2 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {/* View Mode Switcher - Desktop */}
        <div className="hidden md:flex gap-1 mr-2">
          <Button
            variant={viewModeAudio === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewModeAudio("list")}
            className="h-8 w-8"
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={viewModeAudio === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewModeAudio("grid")}
            className="h-8 w-8"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewModeAudio === "large" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewModeAudio("large")}
            className="h-8 w-8"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Volume Control - Desktop */}
        <div className="hidden md:flex w-24 mr-2 items-center gap-2">
          <Volume2 className="h-6 w-6" />
          <Slider
            defaultValue={[sliderValue]}
            min={0}
            max={1}
            step={0.1}
            value={[sliderValue]}
            onValueChange={(value) => setSliderValue(value[0])}
          />
        </div>

        {/* Mobile Popup Menu */}
        <div className="md:hidden mr-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>View Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* View Mode Section */}
              <div className="px-2 py-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">View Mode</p>
                <div className="flex gap-2">
                  <Button
                    variant={viewModeAudio === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeAudio("list")}
                    className="flex-1"
                  >
                    <LayoutList className="h-4 w-4 mr-1" />
                    List
                  </Button>
                  <Button
                    variant={viewModeAudio === "grid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeAudio("grid")}
                    className="flex-1"
                  >
                    <LayoutGrid className="h-4 w-4 mr-1" />
                    Grid
                  </Button>
                  <Button
                    variant={viewModeAudio === "large" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeAudio("large")}
                    className="flex-1"
                  >
                    <Maximize2 className="h-4 w-4 mr-1" />
                    Large
                  </Button>
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Volume Section */}
              <div className="px-2 py-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">Volume</p>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  <Slider
                    defaultValue={[sliderValue]}
                    min={0}
                    max={1}
                    step={0.1}
                    value={[sliderValue]}
                    onValueChange={(value) => setSliderValue(value[0])}
                    className="flex-1"
                  />
                  <span className="text-xs w-8 text-right">{Math.round(sliderValue * 100)}%</span>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search..."
            value={sfxSearch}
            onChange={(e) => setSfxSearch(e.target.value)}
            className="pl-10 pr-10 text-sm"
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground rounded-xl px-2 py-1 text-xs">
            {sfxSearchCount}
          </div>
        </div>
      </div>
      <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto">
        {showEmptyState ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {sfxSearch
              ? "No files found matching your search"
              : "No sound files found"}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: totalHeight || (isLoading ? ITEM_HEIGHTS[viewModeAudio] : 0) }}
          >
            {!!virtualItems.length && (
              <div
                className={`absolute left-0 right-0 space-y-2`}
                style={{
                  transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  if (viewModeAudio === "grid") {
                    // Grid mode: dynamic columns based on screen width
                    const startIndex = virtualRow.index * gridColumns;
                    const files = Array.from({ length: gridColumns }, (_, i) =>
                      sfxFiles[startIndex + i]
                    ).filter(Boolean);

                    const gridColsClass =
                      gridColumns === 5 ? "grid-cols-5" :
                        gridColumns === 4 ? "grid-cols-4" :
                          gridColumns === 3 ? "grid-cols-3" :
                            "grid-cols-2";

                    return (
                      <div
                        key={virtualRow.index}
                        className={`grid ${gridColsClass} gap-2`}
                        style={{ minHeight: virtualRow.size }}
                      >
                        {files.map(file => renderAudioCard(file, 60, virtualRow.size))}
                      </div>
                    );
                  } else {
                    // List or Large mode: single column
                    const file = sfxFiles[virtualRow.index];
                    if (!file) return null;

                    const waveHeight = viewModeAudio === "large" ? 80 : 40;
                    return renderAudioCard(file, waveHeight, virtualRow.size);
                  }
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the file from your system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
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
            ref={renameInputRef}
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRenameConfirm();
              } else if (e.key === 'Escape') {
                handleRenameCancel();
              }
            }}
            placeholder="New file name"
            className="mt-2"
            autoFocus
          />
          <AlertDialogFooter>
            <Button variant="outline" onClick={handleRenameCancel}>
              Cancel
            </Button>
            <Button onClick={handleRenameConfirm} disabled={!newFileName.trim()}>
              Rename
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
};

export default SfxPage;
