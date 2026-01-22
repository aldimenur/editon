import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import WavesurferRender from "@/components/wavesurfer";
import { Input } from "@/components/ui/input";
import { Search, Volume2, LayoutList, LayoutGrid, Maximize2, FolderSearch, Download, MoreHorizontal } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import useViewStore from "@/stores/view-store";

const ITEM_HEIGHTS = {
  list: 90,
  grid: 110,
  large: 140,
};

const SfxPage = () => {
  const { sfxSearch, setSfxSearch, parentPath } = useAssetStore((state) => state);
  const [files, setFiles] = useState<Asset[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [pageSize] = useState(40);
  const [isLoading, setIsLoading] = useState(false);
  const [sliderValue, setSliderValue] = useState(0.5);
  const { viewModeAudio, setViewModeAudio } = useViewStore((state) => state);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasMore = files.length < searchCount;

  const readMediaFiles = async (pageParam: number, reset: boolean = false) => {
    if (!parentPath) return;
    try {
      setIsLoading(true);
      const result = await invoke<any>("get_assets_paginated", {
        page: pageParam,


        pageSize: pageSize,
        query: sfxSearch || "",
        assetType: "audio",
      });

      const assets = result.data || [];
      setFiles((prev) => (reset ? assets : [...prev, ...assets]));
      setSearchCount(result.total_items ?? 0);

      console.log("Loaded page", pageParam, "Total:", result.total_items, "Assets:", assets.length);

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // initial load / path change
  useEffect(() => {
    if (!parentPath) {
      setFiles([]);
      setSearchCount(0);
      return;
    }
    readMediaFiles(1, true);
  }, [parentPath]);

  // search
  useEffect(() => {
    if (!parentPath) return;
    setFiles([]);
    setSearchCount(0);

    const timeout = setTimeout(() => {
      readMediaFiles(1, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [sfxSearch, parentPath]);

  // Calculate row count based on view mode
  const getRowCount = () => {
    if (viewModeAudio === "grid") {
      return Math.ceil(files.length / 2);
    }
    return files.length;
  };

  const rowVirtualizer = useVirtualizer({
    count: getRowCount(),
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_HEIGHTS[viewModeAudio],
    getItemKey: (index) => `${viewModeAudio}-${index}`, // reset size cache when mode changes
    overscan: 10,
  });

  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || files.length === 0) return;

    const virtualItems = rowVirtualizer.getVirtualItems();
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // Calculate actual file index based on view mode
    const actualLastIndex = viewModeAudio === "grid"
      ? (lastItem.index * 2) + 1  // In grid mode, each row has 2 items
      : lastItem.index;

    // when we scroll within a few items of the end, load next page
    if (actualLastIndex >= files.length - 5) {
      const nextPage = Math.floor(files.length / pageSize) + 1;
      console.log("Loading next page:", nextPage);
      readMediaFiles(nextPage);
    }
  }, [rowVirtualizer.getVirtualItems(), files.length, hasMore, isLoading, pageSize, viewModeAudio]);

  // Reset scroll position when view mode changes
  useEffect(() => {
    rowVirtualizer.measure(); // force recalculation with new item heights
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewModeAudio, rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  const showEmptyState = !isLoading && files.length === 0;

  const renderAudioCard = (file: Asset, waveHeight: number, minHeight: number) => {
    return (
      <div
        key={file.id}
        className="border-2 rounded-lg flex"
        style={{ height: minHeight, width: "100%" }}
      >
        <div className="h-full flex flex-col flex-1 bg-accent">
          <div className="flex justify-between items-center">
            <p className="text-xs font-medium p-1 w-32 truncate whitespace-nowrap pb-2">
              {file.filename}
            </p>
            <Button variant="ghost" size="icon-sm">
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
            <Button variant="ghost" size="icon-sm" onClick={() => invoke("show_in_folder", { path: file.original_path })}>
              <FolderSearch className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 relative">
      <div className="flex items-center justify-between gap-2">
        {/* View Mode Switcher */}
        <div className="flex gap-1 mr-2">
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

        {/* Volume Control */}
        <div className="w-24 mr-2 flex items-center gap-2">
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

        <div className="relative mb-2 flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search..."
            value={sfxSearch}
            onChange={(e) => setSfxSearch(e.target.value)}
            className="pl-10 pr-10 text-sm"
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground rounded-md px-2 text-xs">
            {searchCount} Items
          </div>
        </div>
      </div>
      <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto pr-2">
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
                    // Grid mode: 2 columns
                    const file1 = files[virtualRow.index * 2];
                    const file2 = files[virtualRow.index * 2 + 1];

                    return (
                      <div
                        key={virtualRow.index}
                        className="grid grid-cols-2 gap-2"
                        style={{ minHeight: virtualRow.size }}
                      >
                        {file1 && renderAudioCard(file1, 60, virtualRow.size)}
                        {file2 && renderAudioCard(file2, 60, virtualRow.size)}
                      </div>
                    );
                  } else {
                    // List or Large mode: single column
                    const file = files[virtualRow.index];
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
    </div>
  );
};

export default SfxPage;
