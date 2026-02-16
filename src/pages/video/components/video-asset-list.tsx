import type { Asset } from "@/types/tauri";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { ReactNode, RefObject } from "react";

type VideoViewMode = "list" | "grid" | "large";

type VideoAssetListProps = {
  containerRef: RefObject<HTMLDivElement>;
  showEmptyState: boolean;
  videoSearchText: string;
  totalHeight: number;
  isLoading: boolean;
  rowHeight: number;
  virtualItems: VirtualItem[];
  viewModeVideo: VideoViewMode;
  gridColumns: number;
  videoFiles: Asset[];
  measureElement: (element: HTMLDivElement | null) => void;
  renderVideoCard: (file: Asset, minHeight: number) => ReactNode;
};

export default function VideoAssetList({
  containerRef,
  showEmptyState,
  videoSearchText,
  totalHeight,
  isLoading,
  rowHeight,
  virtualItems,
  viewModeVideo,
  gridColumns,
  videoFiles,
  measureElement,
  renderVideoCard,
}: VideoAssetListProps) {
  return (
    <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto">
      {showEmptyState ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          {videoSearchText
            ? "No videos found matching your search"
            : "No video files found"}
        </div>
      ) : (
        <div
          className="relative w-full"
          style={{ height: totalHeight || (isLoading ? rowHeight : 0) }}
        >
          {!!virtualItems.length &&
            virtualItems.map((virtualRow) => {
              if (viewModeVideo === "grid") {
                const startIndex = virtualRow.index * gridColumns;
                const files = Array.from(
                  { length: gridColumns },
                  (_, i) => videoFiles[startIndex + i],
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
                    key={virtualRow.key}
                    ref={measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 right-0 pb-1"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className={`grid ${gridColsClass} gap-1`}>
                      {files.map((file) => renderVideoCard(file, rowHeight))}
                    </div>
                  </div>
                );
              }

              const file = videoFiles[virtualRow.index];
              if (!file) return null;

              return (
                <div
                  key={virtualRow.key}
                  ref={measureElement}
                  data-index={virtualRow.index}
                  className="absolute left-0 right-0 pb-1"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderVideoCard(file, virtualRow.size)}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
