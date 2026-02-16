import type { Asset } from "@/types/tauri";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { RefObject, ReactNode } from "react";

type ImageViewMode = "list" | "grid" | "large";

type ImageAssetListProps = {
  containerRef: RefObject<HTMLDivElement>;
  showEmptyState: boolean;
  imageSearchText: string;
  totalHeight: number;
  isLoading: boolean;
  rowHeight: number;
  virtualItems: VirtualItem[];
  viewModeImage: ImageViewMode;
  gridColumns: number;
  imageFiles: Asset[];
  renderImageCard: (
    file: Asset,
    minHeight: number,
    isGrid: boolean,
  ) => ReactNode;
};

export default function ImageAssetList({
  containerRef,
  showEmptyState,
  imageSearchText,
  totalHeight,
  isLoading,
  rowHeight,
  virtualItems,
  viewModeImage,
  gridColumns,
  imageFiles,
  renderImageCard,
}: ImageAssetListProps) {
  return (
    <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto">
      {showEmptyState ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          {imageSearchText
            ? "No images found matching your search"
            : "No image files found"}
        </div>
      ) : (
        <div
          className="relative w-full"
          style={{ height: totalHeight || (isLoading ? rowHeight : 0) }}
        >
          {!!virtualItems.length && (
            <div
              className="absolute left-0 right-0 space-y-1"
              style={{
                transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
              }}
            >
              {virtualItems.map((virtualRow) => {
                if (viewModeImage === "grid") {
                  const startIndex = virtualRow.index * gridColumns;
                  const files = Array.from(
                    { length: gridColumns },
                    (_, i) => imageFiles[startIndex + i],
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
                      className={`grid ${gridColsClass} gap-1`}
                      style={{ minHeight: virtualRow.size }}
                    >
                      {files.map((file) =>
                        renderImageCard(file, rowHeight, true),
                      )}
                    </div>
                  );
                }

                const file = imageFiles[virtualRow.index];
                if (!file) return null;

                return renderImageCard(file, virtualRow.size, false);
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
