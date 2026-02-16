import { Button } from "@/components/ui/button";
import { trimMediaAction } from "@/lib/actions/trim-media";
import { applyDragImage, getDragPreviewIcon } from "@/lib/drag-preview";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Asset } from "@/types/tauri";
import { MoreHorizontal, Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

type VideoViewMode = "list" | "grid" | "large";

type VideoCardProps = {
  file: Asset;
  minHeight?: number;
  viewModeVideo: VideoViewMode;
  gridItemHeight: number;
  videoSearchText: string;
  isSelected: boolean;
  highlightText: (text: string, search: string) => ReactNode;
  renderTags: (tags: string | null | undefined) => ReactNode;
  formatVideoTime: (seconds: number) => string;
  onOpenContextMenu: (file: Asset, x: number, y: number) => void;
  onAssetDragStart: (
    event: ReactDragEvent<HTMLDivElement>,
    file: Asset,
  ) => void;
  onAssetDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  onOpenFullscreen: (file: Asset) => void;
  onDeleteClick: (path: string) => void;
};

export default function VideoCard({
  file,
  minHeight = 0,
  viewModeVideo,
  gridItemHeight,
  videoSearchText,
  isSelected,
  highlightText,
  renderTags,
  formatVideoTime,
  onOpenContextMenu,
  onAssetDragStart,
  onAssetDragEnd,
  onOpenFullscreen,
  onDeleteClick,
}: VideoCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const trimBarRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimCursorRatio, setTrimCursorRatio] = useState<number | null>(null);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 1 });
  const [appliedTrimRange, setAppliedTrimRange] = useState({
    start: 0,
    end: 1,
  });
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimError, setTrimError] = useState<string | null>(null);
  const [trimmedOutputPath, setTrimmedOutputPath] = useState<string | null>(
    null,
  );
  const [isHoveringCard, setIsHoveringCard] = useState(false);
  const [isTrimBarPinned, setIsTrimBarPinned] = useState(false);
  const videoSrc = convertFileSrc(file.original_path);
  const thumbSrc = file.thumbnail_path
    ? convertFileSrc(file.thumbnail_path)
    : "";
  const durationSec = file.duration_sec > 0 ? file.duration_sec : 0;
  const MIN_TRIM_WIDTH = 0.02;
  const hasTrimChanges =
    Math.abs(trimRange.start - appliedTrimRange.start) > 0.0001 ||
    Math.abs(trimRange.end - appliedTrimRange.end) > 0.0001;
  const isGrid = viewModeVideo === "grid";
  const showVideo = playing || !thumbSrc;
  const showTrimBar = isHoveringCard || isTrimBarPinned || hasTrimChanges;

  useEffect(() => {
    setTrimRange({ start: 0, end: 1 });
    setAppliedTrimRange({ start: 0, end: 1 });
    setTrimError(null);
    setIsTrimming(false);
    setTrimmedOutputPath(null);
    setPlaying(false);
    setIsVideoPlaying(false);
    setIsMuted(true);
    setCurrentTime(0);
    setVideoDuration(0);
    setTrimCursorRatio(null);
    setIsHoveringCard(false);
    setIsTrimBarPinned(false);
  }, [file.original_path]);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

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

  const handleTrimApply = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
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
    event.preventDefault();
    event.stopPropagation();
    setIsTrimBarPinned(true);
    setTrimRange(appliedTrimRange);
    setTrimError(null);
  };

  const handleTrimmedDragStart = (event: ReactDragEvent<HTMLButtonElement>) => {
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

  const handleTrimmedDragEnd = (event: ReactDragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleStartPlayback = () => {
    setPlaying(true);
    const node = videoRef.current;
    if (!node) return;
    void node.play().catch(() => {
      // Ignore autoplay restrictions and let user press play button.
    });
  };

  const handleSeek = (event: ReactMouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  const handleTogglePlayback = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const node = videoRef.current;
    if (!node) {
      handleStartPlayback();
      return;
    }

    if (node.paused) {
      void node.play();
    } else {
      node.pause();
    }
  };

  const handleToggleMute = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const seekTo = (nextTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  };

  const toggleVideoPlayback = () => {
    const node = videoRef.current;
    if (!node) return;

    if (node.paused) {
      void node.play();
    } else {
      node.pause();
    }
  };

  const handleVideoClick = (event: ReactMouseEvent<HTMLVideoElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleVideoPlayback();
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

  const handleTrimBarPointerMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!trimBarRef.current) return;
    const rect = trimBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setTrimCursorRatio(ratio);
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

  return (
    <div
      ref={cardRef}
      key={file.id}
      className={`group relative flex flex-col border rounded-lg overflow-hidden bg-card transition-all hover:shadow-lg ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
      onMouseMove={handleCardPointerMove}
      onMouseEnter={() => setIsHoveringCard(true)}
      onMouseLeave={() => {
        setIsHoveringCard(false);
        setTrimCursorRatio(null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (file.id == null) return;
        onOpenContextMenu(file, event.clientX, event.clientY);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenFullscreen(file);
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
        {!showVideo ? (
          <div
            className="relative h-full w-full cursor-pointer"
            onClick={handleStartPlayback}
          >
            <img
              src={thumbSrc}
              className="absolute inset-0 h-full w-full object-cover bg-muted"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-full border border-white/50 bg-black/45 p-3 backdrop-blur-sm">
                <Play className="h-7 w-7 text-white" />
              </div>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={videoSrc}
            className="absolute inset-0 h-full w-full object-cover bg-muted"
            playsInline
            disablePictureInPicture
            controlsList="nofullscreen"
            autoPlay={playing}
            muted={isMuted}
            onPlay={() => setIsVideoPlaying(true)}
            onPause={() => setIsVideoPlaying(false)}
            onLoadedMetadata={(event) => {
              setVideoDuration(event.currentTarget.duration || 0);
            }}
            onTimeUpdate={(event) => {
              setCurrentTime(event.currentTarget.currentTime || 0);
            }}
            onClick={handleVideoClick}
          />
        )}
      </div>

      {showVideo && (
        <div
          className="absolute inset-x-2 bottom-8 z-20 flex items-center justify-between"
          data-no-card-drag="true"
        >
          <div className="flex items-center gap-1">
            <Button
              size="icon-xs"
              variant="outline"
              className="h-6 w-6 rounded-sm bg-background/80"
              onClick={handleTogglePlayback}
              title={isVideoPlaying ? "Pause" : "Play"}
            >
              {isVideoPlaying ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </Button>
            <Button
              size="icon-xs"
              variant="outline"
              className="h-6 w-6 rounded-sm bg-background/80"
              onClick={handleToggleMute}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="h-3 w-3" />
              ) : (
                <Volume2 className="h-3 w-3" />
              )}
            </Button>
          </div>
          <div className="rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground/90">
            {formatVideoTime(currentTime)} / {formatVideoTime(videoDuration)}
          </div>
        </div>
      )}

      {showVideo && (
        <div
          className="absolute inset-x-2 bottom-4 z-20"
          data-no-card-drag="true"
        >
          <input
            type="range"
            min={0}
            max={videoDuration || 0}
            step={0.1}
            value={Math.min(currentTime, videoDuration || 0)}
            onMouseDown={handleSeek}
            onPointerDown={(event) => event.stopPropagation()}
            onInput={(event) => {
              event.stopPropagation();
              const nextTime = Number(event.currentTarget.value);
              seekTo(nextTime);
            }}
            onChange={(event) => {
              event.stopPropagation();
              const nextTime = Number(event.currentTarget.value);
              seekTo(nextTime);
            }}
            className="h-[3px] w-full accent-primary"
          />
        </div>
      )}

      {hasTrimChanges && (
        <div
          className="absolute left-2 top-2 z-20 flex items-center gap-1"
          data-no-card-drag="true"
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
          data-no-card-drag="true"
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
            onClick={() => onDeleteClick(trimmedOutputPath)}
          >
            Delete
          </Button>
        </div>
      )}

      {showTrimBar && (
        <div
          className="absolute inset-x-2 bottom-0.5 z-20"
          data-no-card-drag="true"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div
            ref={trimBarRef}
            className="relative h-[3px] rounded-full bg-background/80"
            onClick={handleTrimBarClick}
            onMouseMove={handleTrimBarPointerMove}
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
        <div className="absolute bottom-4 left-2 z-20 max-w-[70%] truncate rounded-[6px] bg-destructive/85 px-2 py-0.5 text-[10px] text-destructive-foreground">
          {trimError}
        </div>
      )}

      <div
        className={`pointer-events-none absolute left-2 z-20 max-w-[70%] truncate rounded-sm bg-black/35 px-2 py-0.5 text-xs font-medium text-white ${hasTrimChanges ? "top-10" : "top-2"}`}
      >
        {highlightText(file.filename, videoSearchText)}
      </div>

      <div
        className={`pointer-events-none absolute inset-x-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${showVideo ? "bottom-16" : "bottom-12"}`}
      >
        <div className="max-h-7 overflow-hidden">{renderTags(file.tags)}</div>
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
