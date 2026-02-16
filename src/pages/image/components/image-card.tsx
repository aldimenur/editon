import { Button } from "@/components/ui/button";
import type { Asset } from "@/types/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { MoreHorizontal } from "lucide-react";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

type ImageCardProps = {
  file: Asset;
  isSelected: boolean;
  minHeight: number;
  isGrid: boolean;
  gridItemHeight: number;
  imageSearchText: string;
  highlightText: (text: string, search: string) => ReactNode;
  renderTags: (tags: string | null | undefined) => ReactNode;
  onOpenContextMenu: (file: Asset, x: number, y: number) => void;
  onAssetDragStart: (
    event: ReactDragEvent<HTMLDivElement>,
    file: Asset,
  ) => void;
  onAssetDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  onOpenPreview: (file: Asset) => void;
};

export default function ImageCard({
  file,
  isSelected,
  minHeight,
  isGrid,
  gridItemHeight,
  imageSearchText,
  highlightText,
  renderTags,
  onOpenContextMenu,
  onAssetDragStart,
  onAssetDragEnd,
  onOpenPreview,
}: ImageCardProps) {
  const imageSrc = file.thumbnail_path
    ? convertFileSrc(file.thumbnail_path)
    : "";

  return (
    <div
      key={file.id}
      className={`group relative border rounded-lg overflow-hidden bg-card transition-all hover:shadow-lg ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (file.id == null) return;
        onOpenContextMenu(file, event.clientX, event.clientY);
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          if (file.id == null) return;
          onOpenContextMenu(file, rect.left + rect.width / 2, rect.top + 20);
        }
      }}
      title="Right-click or use Shift+F10 for actions"
      tabIndex={0}
      draggable
      onDragStart={(event) => onAssetDragStart(event, file)}
      onDragEnd={onAssetDragEnd}
      style={
        isGrid
          ? { height: gridItemHeight, aspectRatio: "16 / 9" }
          : { minHeight }
      }
    >
      <div className="absolute inset-0">
        <img
          src={imageSrc}
          alt={file.filename}
          className="h-full w-full object-cover bg-muted cursor-pointer"
          loading="lazy"
          decoding="async"
          onClick={() => onOpenPreview(file)}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 px-2 pb-1 pt-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none">
        <div className="absolute inset-x-0 bottom-0 top-0 bg-linear-to-t from-background/95 via-background/70 to-transparent" />
        <div className="relative">
          <div className="text-xs font-medium truncate whitespace-nowrap">
            {highlightText(file.filename, imageSearchText)}
          </div>
          <div className="max-h-7 overflow-hidden">{renderTags(file.tags)}</div>
        </div>
      </div>

      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          className="rounded-sm bg-background/80 shadow-sm hover:bg-background"
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            if (file.id == null) return;
            onOpenContextMenu(file, rect.right - 8, rect.bottom + 2);
          }}
          title="More actions"
        >
          <MoreHorizontal className="h-2 w-2" />
        </Button>
      </div>
    </div>
  );
}
