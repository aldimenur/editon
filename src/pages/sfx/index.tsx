import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import WavesurferRender from "@/components/wavesurfer";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import { Slider } from "@/components/ui/slider";

const ITEM_HEIGHT = 90; // approximate height of each item (px), used for virtualization

const SfxPage = () => {
  const { sfxPath, sfxSearch, setSfxSearch } = useAssetStore((state) => state);
  const [files, setFiles] = useState<Asset[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [pageSize] = useState(40);
  const [isLoading, setIsLoading] = useState(false);
  const [sliderValue, setSliderValue] = useState(0.5);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasMore = files.length < searchCount;

  const readMediaFiles = async (pageParam: number, reset: boolean = false) => {
    if (!sfxPath) return;
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
    if (!sfxPath) {
      setFiles([]);
      setSearchCount(0);
      return;
    }
    readMediaFiles(1, true);
  }, [sfxPath]);

  // search
  useEffect(() => {
    if (!sfxPath) return;
    setFiles([]);
    setSearchCount(0);

    const timeout = setTimeout(() => {
      readMediaFiles(1, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [sfxSearch, sfxPath]);

  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  });

  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || files.length === 0) return;

    const virtualItems = rowVirtualizer.getVirtualItems();
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // when we scroll within a few items of the end, load next page
    if (lastItem.index >= files.length - 5) {
      const nextPage = Math.floor(files.length / pageSize) + 1;
      console.log("Loading next page:", nextPage);
      readMediaFiles(nextPage);
    }
  }, [rowVirtualizer.getVirtualItems(), files.length, hasMore, isLoading, pageSize]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  const showEmptyState = !isLoading && files.length === 0;

  return (
    <div className="px-4 relative">
      <div className="flex items-center justify-between gap-2">
        {/* View Option */}
        <div className="w-24 mr-2">
          <Slider defaultValue={[sliderValue]} min={0} max={1} step={0.1} value={[sliderValue]} onValueChange={(value) => setSliderValue(value[0])} />
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
            style={{ height: totalHeight || (isLoading ? ITEM_HEIGHT : 0) }}
          >
            {!!virtualItems.length && (
              <div
                className="absolute left-0 right-0 space-y-2"
                style={{
                  transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const file = files[virtualRow.index];
                  if (!file) return null;

                  return (
                    <div
                      key={file.id}
                      className="border rounded-lg"
                      style={{ height: virtualRow.size }}
                    >
                      <p className="text-xs font-medium mb-2 bg-accent p-1 text-ellipsis overflow-hidden whitespace-nowrap">
                        {file.filename}
                      </p>
                      <WavesurferRender
                        src={file.original_path}
                        waveform={file.waveform_data || []}
                        volume={sliderValue}
                        height={50}
                        width={"100%"}
                      />
                    </div>
                  );
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
