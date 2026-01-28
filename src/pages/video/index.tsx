import useAssetStore from "@/stores/asset-store";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, LayoutList, LayoutGrid, Maximize2, Settings2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import { Button } from "@/components/ui/button";
import useViewStore from "@/stores/view-store";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { formatFileSize } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ITEM_HEIGHTS = {
  list: 240,
  grid: 280,
  large: 400,
};

const VideoPage = () => {
  const {
    videoSearch,
    setVideoSearch,
    parentPath,
    videoFiles,
    videoSearchCount,
    isLoading,
    fetchVideoAssets,
    video
  } = useAssetStore((state) => state);

  const [pageSize] = useState(10);
  const { viewModeVideo, setViewModeVideo } = useViewStore((state) => state);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasMore = videoFiles.length < videoSearchCount;

  // initial load / path change
  useEffect(() => {
    if (!parentPath) {
      return;
    }
    fetchVideoAssets(1, pageSize, true);
  }, [parentPath, pageSize, fetchVideoAssets, video]);

  // search with debounce
  useEffect(() => {
    if (!parentPath) return;

    const timeout = setTimeout(() => {
      fetchVideoAssets(1, pageSize, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [videoSearch, parentPath, pageSize, fetchVideoAssets]);

  // Calculate row count based on view mode
  const getRowCount = () => {
    if (viewModeVideo === "grid") {
      return Math.ceil(videoFiles.length / 3); // 3 columns for grid
    }
    return videoFiles.length;
  };

  const rowVirtualizer = useVirtualizer({
    count: getRowCount(),
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_HEIGHTS[viewModeVideo],
    getItemKey: (index) => `${viewModeVideo}-${index}`, // reset size cache when mode changes
    overscan: 5,
  });

  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || videoFiles.length === 0) return;

    const virtualItems = rowVirtualizer.getVirtualItems();
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // Calculate actual file index based on view mode
    const actualLastIndex = viewModeVideo === "grid"
      ? (lastItem.index * 3) + 2  // In grid mode, each row has 3 items
      : lastItem.index;

    // when we scroll within a few items of the end, load next page
    if (actualLastIndex >= videoFiles.length - 5) {
      const nextPage = Math.floor(videoFiles.length / pageSize) + 1;
      console.log("Loading next page:", nextPage);
      fetchVideoAssets(nextPage, pageSize);
    }
  }, [rowVirtualizer.getVirtualItems(), videoFiles.length, hasMore, isLoading, pageSize, viewModeVideo, fetchVideoAssets]);

  // Reset scroll position when view mode changes
  useEffect(() => {
    rowVirtualizer.measure(); // force recalculation with new item heights
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewModeVideo, rowVirtualizer]);

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

  const renderVideoCard = (file: Asset, videoHeight: string, minHeight: number) => {
    const videoSrc = convertFileSrc(file.original_path)

    return (
      <div
        key={file.id}
        className="flex flex-col justify-between border rounded-lg overflow-hidden bg-card transition-all hover:shadow-lg"
        style={{ minHeight }}
      >
        <video
          src={videoSrc}
          className={`w-full ${videoHeight} object-cover bg-muted`}
          controls
        />
        {/* Video Info */}
        <div className="p-2 bg-accent flex-1">
          <p className="text-xs font-medium mb-1 text-ellipsis overflow-hidden whitespace-nowrap">
            {highlightText(file.filename, videoSearch)}
          </p>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="cursor-pointer truncate w-1/2 text-primary" onClick={() => revealItemInDir(file.original_path)}>
              {file.original_path}
            </span>
            <span>{formatFileSize(file.file_size)}</span>
          </div>
        </div>
      </div>
    );
  };

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  const showEmptyState = !isLoading && videoFiles.length === 0;

  return (
    <div className="px-2 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {/* View Mode Switcher - Desktop */}
        <div className="hidden md:flex gap-1 mr-2">
          <Button
            variant={viewModeVideo === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewModeVideo("list")}
            className="h-8 w-8"
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={viewModeVideo === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewModeVideo("grid")}
            className="h-8 w-8"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewModeVideo === "large" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewModeVideo("large")}
            className="h-8 w-8"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
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
                    variant={viewModeVideo === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeVideo("list")}
                    className="flex-1"
                  >
                    <LayoutList className="h-4 w-4 mr-1" />
                    List
                  </Button>
                  <Button
                    variant={viewModeVideo === "grid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeVideo("grid")}
                    className="flex-1"
                  >
                    <LayoutGrid className="h-4 w-4 mr-1" />
                    Grid
                  </Button>
                  <Button
                    variant={viewModeVideo === "large" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewModeVideo("large")}
                    className="flex-1"
                  >
                    <Maximize2 className="h-4 w-4 mr-1" />
                    Large
                  </Button>
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
            value={videoSearch}
            onChange={(e) => setVideoSearch(e.target.value)}
            className="pl-10 pr-10 text-sm"
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground rounded-xl px-2 py-1 text-xs">
            {videoSearchCount}
          </div>
        </div>
      </div>
      <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto">
        {showEmptyState ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {videoSearch
              ? "No videos found matching your search"
              : "No video files found"}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: totalHeight || (isLoading ? ITEM_HEIGHTS[viewModeVideo] : 0) }}
          >
            {!!virtualItems.length && (
              <div
                className={`absolute left-0 right-0 space-y-2`}
                style={{
                  transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  if (viewModeVideo === "grid") {
                    // Grid mode: 3 columns
                    const file1 = videoFiles[virtualRow.index * 3];
                    const file2 = videoFiles[virtualRow.index * 3 + 1];
                    const file3 = videoFiles[virtualRow.index * 3 + 2];

                    return (
                      <div
                        key={virtualRow.index}
                        className="grid grid-cols-3 gap-2"
                        style={{ minHeight: virtualRow.size }}
                      >
                        {file1 && renderVideoCard(file1, "h-52", virtualRow.size)}
                        {file2 && renderVideoCard(file2, "h-52", virtualRow.size)}
                        {file3 && renderVideoCard(file3, "h-52", virtualRow.size)}
                      </div>
                    );
                  } else {
                    // List or Large mode: single column
                    const file = videoFiles[virtualRow.index];
                    if (!file) return null;

                    const videoHeight = viewModeVideo === "large" ? "h-80" : "h-48";
                    return renderVideoCard(file, videoHeight, virtualRow.size);
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

export default VideoPage;