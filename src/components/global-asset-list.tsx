import type { Asset } from "@/types/tauri";
import { useVirtualizer } from "@tanstack/react-virtual";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FileImage, FileMusic, FileVideo2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

type ViewMode = "list" | "grid" | "large";

type GlobalAssetListProps = {
  assets: Asset[];
  searchText: string;
  viewMode: ViewMode;
  selectedIds: number[];
  isLoading: boolean;
  hasMore: boolean;
  onToggleSelect: (assetId: number) => void;
  onLoadMore: () => void;
  renderAsset?: (asset: Asset, isSelected: boolean, index: number) => ReactNode;
};

function getTypeLabel(typeName: string) {
  if (typeName === "audio") return "Sound";
  if (typeName === "video") return "Video";
  if (typeName === "image") return "Image";
  return "Asset";
}

function getTypeIcon(typeName: string) {
  if (typeName === "audio") return <FileMusic size={14} />;
  if (typeName === "video") return <FileVideo2 size={14} />;
  return <FileImage size={14} />;
}

function highlightText(text: string, searchText: string) {
  if (!searchText.trim()) return text;
  const lowerText = text.toLowerCase();
  const lowerSearch = searchText.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);
  if (index < 0) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + searchText.length);
  const after = text.slice(index + searchText.length);

  return (
    <>
      {before}
      <span className="bg-yellow-400/30">{match}</span>
      {after}
    </>
  );
}

function DefaultAssetCard({
  asset,
  isSelected,
  isGrid,
  isLarge,
  searchText,
  onToggleSelect,
}: {
  asset: Asset;
  isSelected: boolean;
  isGrid: boolean;
  isLarge: boolean;
  searchText: string;
  onToggleSelect: (assetId: number) => void;
}) {
  const thumbSrc = asset.thumbnail_path
    ? convertFileSrc(asset.thumbnail_path)
    : "";

  return (
    <button
      type="button"
      className={
        "text-left group border transition-colors overflow-hidden " +
        (isSelected
          ? "border-primary ring-1 ring-primary/35"
          : "border-border hover:border-primary/40") +
        (isGrid ? " rounded-md" : " rounded-none")
      }
      onClick={() => {
        if (typeof asset.id === "number") {
          onToggleSelect(asset.id);
        }
      }}
    >
      <div
        className={
          isGrid
            ? `relative bg-muted/40 ${isLarge ? "h-56" : "h-36"}`
            : "flex items-center gap-2 p-2"
        }
      >
        {isGrid ? (
          <>
            {thumbSrc ? (
              <img
                src={thumbSrc}
                alt={asset.filename}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                {getTypeIcon(asset.type_name)}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-background/90 via-background/60 to-transparent p-2">
              <div className="text-xs font-medium truncate">
                {highlightText(asset.filename, searchText)}
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                {getTypeIcon(asset.type_name)}
                {getTypeLabel(asset.type_name)}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="h-8 w-8 bg-muted/60 flex items-center justify-center shrink-0">
              {getTypeIcon(asset.type_name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">
                {highlightText(asset.filename, searchText)}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {asset.original_path}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground shrink-0">
              {getTypeLabel(asset.type_name)}
            </div>
          </>
        )}
      </div>
    </button>
  );
}

export default function GlobalAssetList({
  assets,
  searchText,
  viewMode,
  selectedIds,
  isLoading,
  hasMore,
  onToggleSelect,
  onLoadMore,
  renderAsset,
}: GlobalAssetListProps) {
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const isGrid = viewMode === "grid";
  const isLarge = viewMode === "large";
  const isList = viewMode === "list";

  const virtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => {
      if (isLarge) return 340;
      if (isGrid) return 260;
      return 240;
    },
    overscan: 6,
    enabled: isList,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!isList || !hasMore || isLoading || virtualItems.length === 0) {
      return;
    }

    const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;
    if (lastVisibleIndex >= assets.length - 5) {
      onLoadMore();
    }
  }, [assets.length, hasMore, isList, isLoading, onLoadMore, virtualItems]);

  return (
    <div
      ref={scrollElementRef}
      className="flex-1 overflow-y-auto"
      onScroll={
        isList
          ? undefined
          : (event) => {
              const target = event.currentTarget;
              const nearBottom =
                target.scrollTop + target.clientHeight >=
                target.scrollHeight - 160;
              if (nearBottom && hasMore && !isLoading) {
                onLoadMore();
              }
            }
      }
    >
      {assets.length === 0 && !isLoading ? (
        <div className="text-center text-muted-foreground py-8 text-sm border border-dashed border-border/60 rounded-[6px] bg-muted/10">
          {searchText
            ? "No assets found matching your search"
            : "No assets found"}
        </div>
      ) : isList ? (
        <div
          className="relative w-full"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {virtualItems.map((virtualItem) => {
            const asset = assets[virtualItem.index];
            if (!asset) return null;

            const isSelected =
              typeof asset.id === "number" && selectedIds.includes(asset.id);
            const custom = renderAsset?.(asset, isSelected, virtualItem.index);

            return (
              <div
                key={asset.id ?? asset.original_path}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 top-0 w-full"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {custom ?? (
                  <DefaultAssetCard
                    asset={asset}
                    isSelected={isSelected}
                    isGrid={false}
                    isLarge={false}
                    searchText={searchText}
                    onToggleSelect={onToggleSelect}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={
            isGrid
              ? "columns-2 md:columns-3 xl:columns-4 2xl:columns-5 gap-2"
              : "flex flex-col gap-1"
          }
        >
          {assets.map((asset, index) => {
            const isSelected =
              typeof asset.id === "number" && selectedIds.includes(asset.id);
            const custom = renderAsset?.(asset, isSelected, index);

            return (
              <div
                key={asset.id ?? asset.original_path}
                className={isGrid ? "mb-2 break-inside-avoid w-full" : "w-full"}
              >
                {custom ?? (
                  <DefaultAssetCard
                    asset={asset}
                    isSelected={isSelected}
                    isGrid={isGrid}
                    isLarge={isLarge}
                    searchText={searchText}
                    onToggleSelect={onToggleSelect}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {isLoading && (
        <div className="text-center text-xs text-muted-foreground py-3">
          Loading assets...
        </div>
      )}
    </div>
  );
}
