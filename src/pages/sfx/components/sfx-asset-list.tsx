import type { Asset } from "@/types/tauri";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { ReactNode, RefObject } from "react";

type AudioViewMode = "list" | "grid" | "large";

type SfxAssetListProps = {
  containerRef: RefObject<HTMLDivElement>;
  showEmptyState: boolean;
  sfxSearchText: string;
  totalHeight: number;
  isLoading: boolean;
  itemHeight: number;
  virtualItems: VirtualItem[];
  viewModeAudio: AudioViewMode;
  gridColumns: number;
  sfxFiles: Asset[];
  measureElement: (element: HTMLDivElement | null) => void;
  renderSfxCard: (
    file: Asset,
    waveHeight: number,
    showFileName: boolean,
  ) => ReactNode;
};

export default function SfxAssetList({
  containerRef,
  showEmptyState,
  sfxSearchText,
  totalHeight,
  isLoading,
  itemHeight,
  virtualItems,
  viewModeAudio,
  gridColumns,
  sfxFiles,
  measureElement,
  renderSfxCard,
}: SfxAssetListProps) {
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {showEmptyState ? (
        <div className="text-center text-muted-foreground py-4 text-[11px] border border-dashed border-border/60 rounded-[6px] bg-muted/10">
          {sfxSearchText
            ? "No files found matching your search"
            : "No sound files found"}
        </div>
      ) : (
        <div
          className="relative w-full"
          style={{
            height: totalHeight || (isLoading ? itemHeight : 0),
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
                      ref={measureElement}
                      className={`grid ${gridColsClass} gap-1`}
                      style={{ minHeight: virtualRow.size }}
                    >
                      {files.map((file) => renderSfxCard(file, 36, false))}
                    </div>
                  );
                }

                const file = sfxFiles[virtualRow.index];
                if (!file) return null;

                const waveHeight = viewModeAudio === "large" ? 56 : 32;
                return (
                  <div
                    key={file.id}
                    data-index={virtualRow.index}
                    ref={measureElement}
                  >
                    {renderSfxCard(file, waveHeight, viewModeAudio === "large")}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
