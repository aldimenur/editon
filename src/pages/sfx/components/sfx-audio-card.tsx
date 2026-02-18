import { Button } from "@/components/ui/button";
import WavesurferRender from "@/components/wavesurfer";
import { trimMediaAction } from "@/lib/actions/trim-media";
import { applyDragImage, getDragPreviewIcon } from "@/lib/drag-preview";
import { globalAudioPlayer } from "@/lib/global-audio-player";
import type { Asset } from "@/types/tauri";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

type TrimRange = {
  start: number;
  end: number;
};

type SfxAudioCardProps = {
  file: Asset;
  waveHeight: number;
  minHeight: number;
  showFileName: boolean;
  searchText: string;
  volume: number;
  isSelected: boolean;
  onOpenContextMenu: (file: Asset, x: number, y: number) => void;
  onDeleteTrimmed: (path: string) => void;
  renderTags: (tags: string | null) => ReactNode;
  highlightText: (text: string, search: string) => ReactNode;
};

export default function SfxAudioCard({
  file,
  minHeight,
  showFileName,
  searchText,
  volume,
  isSelected,
  onOpenContextMenu,
  onDeleteTrimmed,
  renderTags,
  highlightText,
}: SfxAudioCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const trimBarRef = useRef<HTMLDivElement | null>(null);
  const [trimRange, setTrimRange] = useState<TrimRange>({ start: 0, end: 1 });
  const [appliedTrimRange, setAppliedTrimRange] = useState<TrimRange>({
    start: 0,
    end: 1,
  });
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimError, setTrimError] = useState<string | null>(null);
  const [trimmedOutputPath, setTrimmedOutputPath] = useState<string | null>(
    null,
  );
  const [trimCursorRatio, setTrimCursorRatio] = useState<number | null>(null);
  const [isHoveringCard, setIsHoveringCard] = useState(false);
  const [isTrimBarPinned, setIsTrimBarPinned] = useState(false);

  const MIN_TRIM_WIDTH = 0.02;
  const durationSec = file.duration_sec > 0 ? file.duration_sec : 0;
  const hasTrimChanges =
    Math.abs(trimRange.start - appliedTrimRange.start) > 0.0001 ||
    Math.abs(trimRange.end - appliedTrimRange.end) > 0.0001;
  const showTrimBar = isHoveringCard || isTrimBarPinned || hasTrimChanges;

  useEffect(() => {
    setTrimRange({ start: 0, end: 1 });
    setAppliedTrimRange({ start: 0, end: 1 });
    setTrimError(null);
    setIsTrimming(false);
    setTrimmedOutputPath(null);
    setTrimCursorRatio(null);
    setIsHoveringCard(false);
    setIsTrimBarPinned(false);
  }, [file.original_path]);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const setTrimEdgeAtRatio = (edge: "start" | "end", ratio: number) => {
    setIsTrimBarPinned(true);
    setTrimRange((prev) => {
      if (edge === "start") {
        const nextStart = clamp(ratio, 0, prev.end - MIN_TRIM_WIDTH);
        return { ...prev, start: nextStart };
      }

      const nextEnd = clamp(ratio, prev.start + MIN_TRIM_WIDTH, 1);
      return { ...prev, end: nextEnd };
    });
    setTrimError(null);
  };

  const startTrimDrag = (mode: "start" | "end", event: ReactMouseEvent) => {
    if (!trimBarRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setIsTrimBarPinned(true);

    const rect = trimBarRef.current.getBoundingClientRect();
    const initial = { ...trimRange };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - event.clientX) / rect.width;
      let nextStart = initial.start;
      let nextEnd = initial.end;

      if (mode === "start") {
        nextStart = clamp(
          initial.start + delta,
          0,
          initial.end - MIN_TRIM_WIDTH,
        );
      } else {
        nextEnd = clamp(initial.end + delta, initial.start + MIN_TRIM_WIDTH, 1);
      }

      setTrimRange({ start: nextStart, end: nextEnd });
      setTrimError(null);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleTrimApply = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsTrimBarPinned(true);
    if (durationSec <= 0) {
      setTrimError("Cannot trim media with unknown duration.");
      return;
    }

    setIsTrimming(true);
    setTrimError(null);

    try {
      const outputPath = await trimMediaAction({
        input_path: file.original_path,
        start_sec: trimRange.start * durationSec,
        end_sec: trimRange.end * durationSec,
      });
      setAppliedTrimRange(trimRange);
      setTrimmedOutputPath(outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTrimError(message);
      console.error("Failed to trim media:", error);
    } finally {
      setIsTrimming(false);
    }
  };

  const handleTrimCancel = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsTrimBarPinned(true);
    setTrimRange(appliedTrimRange);
    setTrimError(null);
  };

  const handleTrimmedDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
  ) => {
    if (!trimmedOutputPath) return;
    event.preventDefault();
    event.stopPropagation();

    const dragPreview = getDragPreviewIcon(trimmedOutputPath, "Dragging trim");
    applyDragImage(event.dataTransfer, dragPreview, trimmedOutputPath);

    try {
      startDrag({
        item: [trimmedOutputPath],
        icon: dragPreview || trimmedOutputPath,
        mode: "copy",
      });
    } catch (error) {
      console.error("Failed to drag trimmed media:", error);
    }
  };

  const handleTrimmedDragEnd = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleTrimBarClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsTrimBarPinned(true);

    if (!trimBarRef.current) return;
    const rect = trimBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const distToStart = Math.abs(ratio - trimRange.start);
    const distToEnd = Math.abs(ratio - trimRange.end);
    setTrimEdgeAtRatio(distToStart <= distToEnd ? "start" : "end", ratio);
  };

  const handleCardPointerMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setTrimCursorRatio(ratio);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (trimCursorRatio == null) return;
      if (key !== "i" && key !== "o" && key !== "[" && key !== "]") return;

      event.preventDefault();
      setTrimEdgeAtRatio(
        key === "i" || key === "[" ? "start" : "end",
        trimCursorRatio,
      );
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trimCursorRatio]);

  const isSelectedClass = isSelected
    ? "border-primary ring-1 ring-primary/30"
    : "border-border/60";

  return (
    <div
      ref={cardRef}
      className={`group relative border flex bg-background/70 rounded-[6px] transition-shadow ${isSelectedClass}`}
      style={{ minHeight, height: minHeight, width: "100%" }}
      onMouseMove={handleCardPointerMove}
      onMouseEnter={() => setIsHoveringCard(true)}
      onMouseLeave={() => {
        setIsHoveringCard(false);
        setTrimCursorRatio(null);
        globalAudioPlayer.stop();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenContextMenu(file, event.clientX, event.clientY);
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onOpenContextMenu(file, rect.left + rect.width / 2, rect.top + 20);
        }
      }}
      title={file.filename}
      tabIndex={0}
    >
      <div className="flex flex-col flex-1 items-center justify-center bg-accent/60">
        <WavesurferRender
          src={file.original_path}
          waveform={file.waveform_data || []}
          volume={volume}
          height="70%"
          width={"100%"}
          enableDrag
        />
      </div>
      {hasTrimChanges && (
        <div
          className="absolute left-2 top-2 z-20 flex items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            size="sm"
            className="h-6 rounded-[6px] px-2 text-[10px]"
            disabled={isTrimming}
            onClick={handleTrimApply}
          >
            {isTrimming ? "Applying..." : "Apply"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-[6px] px-2 text-[10px]"
            disabled={isTrimming}
            onClick={handleTrimCancel}
          >
            Cancel
          </Button>
        </div>
      )}
      {trimmedOutputPath && (
        <div
          className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-[6px] bg-background/90 p-1"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            size="sm"
            variant="ghost"
            draggable
            className="h-6 rounded-[6px] px-2 text-[10px]"
            onDragStart={handleTrimmedDragStart}
            onDragEnd={handleTrimmedDragEnd}
            title="Drag trimmed media"
          >
            Drag
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 rounded-[6px] px-2 text-[10px]"
            onClick={() => void revealItemInDir(trimmedOutputPath)}
          >
            Show
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 rounded-[6px] px-2 text-[10px] text-destructive hover:text-destructive"
            onClick={() => onDeleteTrimmed(trimmedOutputPath)}
          >
            Delete
          </Button>
        </div>
      )}
      {showTrimBar && (
        <div
          className="absolute inset-x-2 bottom-0.5 z-20"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div
            ref={trimBarRef}
            className="relative h-[3px] rounded-full bg-background/80"
            onClick={handleTrimBarClick}
            onMouseMove={(event) => {
              if (!trimBarRef.current) return;
              const rect = trimBarRef.current.getBoundingClientRect();
              if (rect.width <= 0) return;
              const ratio = clamp(
                (event.clientX - rect.left) / rect.width,
                0,
                1,
              );
              setTrimCursorRatio(ratio);
            }}
          >
            <div
              className="pointer-events-none absolute bottom-0 top-0 rounded-full bg-primary/90"
              style={{
                left: `${trimRange.start * 100}%`,
                width: `${(trimRange.end - trimRange.start) * 100}%`,
              }}
            />
            <button
              type="button"
              className="absolute top-1/2 z-10 h-3 w-2 -translate-y-1/2 border border-background bg-primary shadow"
              style={{ left: `calc(${trimRange.start * 100}% - 6px)` }}
              onMouseDown={(event) => startTrimDrag("start", event)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label="Trim start handle"
            />
            <button
              type="button"
              className="absolute top-1/2 z-10 h-3 w-2 -translate-y-1/2 border border-background bg-primary shadow"
              style={{ left: `calc(${trimRange.end * 100}% - 6px)` }}
              onMouseDown={(event) => startTrimDrag("end", event)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label="Trim end handle"
            />
          </div>
        </div>
      )}
      {trimError && (
        <div className="absolute bottom-2 left-2 z-20 max-w-[70%] truncate rounded-[6px] bg-destructive/85 px-2 py-0.5 text-[10px] text-destructive-foreground">
          {trimError}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 z-10 pb-2 pl-2 pt-1.5 group-focus-within:opacity-100 pointer-events-none opacity-0 group-hover:opacity-100">
        <div className="relative">
          {showFileName && (
            <div className="inline-block truncate whitespace-nowrap rounded-[6px] bg-background/85 px-1.5 py-0.5 text-[12px] font-semibold leading-none">
              {highlightText(file.filename, searchText)}
            </div>
          )}
          <div className="max-h-5 overflow-hidden">
            {renderTags(file.tags ?? null)}
          </div>
        </div>
      </div>
      <div className="absolute right-0 top-0 z-10 flex items-center rounded-[6px] bg-background/90 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-[6px] bg-transparent p-0 shadow-none hover:bg-background/70 transition-opacity"
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenContextMenu(file, rect.right - 8, rect.bottom + 2);
          }}
          title="More actions"
        >
          <FontAwesomeIcon
            icon={faEllipsisVertical}
            className="text-[10px]"
            fixedWidth
          />
        </Button>
      </div>
    </div>
  );
}
