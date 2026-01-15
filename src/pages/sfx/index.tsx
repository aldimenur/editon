import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import WavesurferRender from "@/components/wavesurfer";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const ITEM_HEIGHT = 90; // approximate height of each item (px), used for virtualization

const SfxPage = () => {
  const { sfxPath } = useAssetStore((state) => state);
  const [files, setFiles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCount, setSearchCount] = useState(0);
  const [pageSize] = useState(40);
  const [isLoading, setIsLoading] = useState(false);

  // virtualization state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const hasMore = files.length < searchCount;

  const readMediaFiles = async (pageParam: number, reset: boolean = false) => {
    if (!sfxPath) return;
    try {
      setIsLoading(true);
      const result: any = await invoke("list_sounds", {
        folderPath: sfxPath,
        page: pageParam,
        pageSize: pageSize,
        query: searchQuery || null,
      });
      const assets = (result.assets || []) as any[];
      setFiles((prev) => (reset ? assets : [...prev, ...assets]));
      setSearchCount(result.total ?? assets.length);
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
  }, [searchQuery, sfxPath]);

  // measure container height for virtualization
  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;
    setScrollTop(scrollTop);

    // infinite scroll: load more when near bottom
    const threshold = 200; // px from bottom
    if (
      !isLoading &&
      hasMore &&
      scrollTop + clientHeight >= scrollHeight - threshold
    ) {
      const nextPage = Math.floor(files.length / pageSize) + 1;
      readMediaFiles(nextPage);
    }
  };

  // virtualization calculations
  const totalHeight = files.length * ITEM_HEIGHT;
  const visibleCount = containerHeight
    ? Math.ceil(containerHeight / ITEM_HEIGHT) + 6 // some buffer
    : files.length;
  const startIndex = containerHeight
    ? Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 3)
    : 0;
  const endIndex = Math.min(files.length, startIndex + visibleCount);
  const offsetY = startIndex * ITEM_HEIGHT;
  const visibleFiles = files.slice(startIndex, endIndex);

  const showEmptyState = !isLoading && files.length === 0;

  return (
    <div className="pt-4 px-4">
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10 text-sm"
        />
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground rounded-md px-2 text-xs">
          {searchCount} Items
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-[calc(100vh-60px)] overflow-y-auto"
        onScroll={handleScroll}
      >
        {showEmptyState ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {searchQuery
              ? "No files found matching your search"
              : "No sound files found"}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: totalHeight || (isLoading ? ITEM_HEIGHT : 0) }}
          >
            <div
              className="absolute left-0 right-0 space-y-2"
              style={{ transform: `translateY(${offsetY}px)` }}
            >
              {visibleFiles.map((file: any) => (
                <div
                  key={file.path}
                  className="border rounded-lg"
                  style={{ height: ITEM_HEIGHT }}
                >
                  <p className="text-xs font-medium mb-2 bg-accent p-1 text-ellipsis overflow-hidden whitespace-nowrap">
                    {file.name}
                  </p>
                  <WavesurferRender
                    src={file.path}
                    height={50}
                    width={"100%"}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {isLoading && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
};

export default SfxPage;
