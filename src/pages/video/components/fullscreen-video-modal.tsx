import { Button } from "@/components/ui/button";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { Asset } from "@/types/tauri";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from "react";

type FullscreenVideoModalProps = {
  fullscreenVideo: Asset | null;
  closeFullscreen: () => void;
  fullscreenContainerRef: RefObject<HTMLDivElement>;
  fullscreenVideoRef: RefObject<HTMLVideoElement>;
  fullscreenTrimBarRef: RefObject<HTMLDivElement>;
  setFullscreenTrimCursorRatio: (value: number | null) => void;
  clamp: (value: number, min: number, max: number) => number;
  formatVideoTime: (seconds: number) => string;
  isFullscreenPlaying: boolean;
  isFullscreenMuted: boolean;
  fullscreenCurrentTime: number;
  fullscreenDuration: number;
  fullscreenTrimRange: { start: number; end: number };
  hasFullscreenTrimChanges: boolean;
  isFullscreenTrimming: boolean;
  fullscreenTrimmedOutputPath: string | null;
  fullscreenTrimError: string | null;
  handleFullscreenVideoClick: (
    event: ReactMouseEvent<HTMLVideoElement>,
  ) => void;
  onFullscreenPlay: () => void;
  onFullscreenPause: () => void;
  onFullscreenLoadedMetadata: (duration: number) => void;
  onFullscreenTimeUpdate: (currentTime: number) => void;
  handleFullscreenTogglePlayback: () => void;
  handleFullscreenToggleMute: () => void;
  seekFullscreenTo: (nextTime: number) => void;
  handleFullscreenTrimBarClick: (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => void;
  startFullscreenTrimDrag: (
    mode: "start" | "end",
    event: ReactMouseEvent,
  ) => void;
  handleFullscreenTrimApply: () => void;
  handleFullscreenTrimCancel: () => void;
  handleFullscreenTrimmedDragStart: (
    event: ReactDragEvent<HTMLButtonElement>,
  ) => void;
  handleFullscreenTrimmedDragEnd: (
    event: ReactDragEvent<HTMLButtonElement>,
  ) => void;
  handleDeleteFullscreenTrimmed: () => void;
};

export default function FullscreenVideoModal({
  fullscreenVideo,
  closeFullscreen,
  fullscreenContainerRef,
  fullscreenVideoRef,
  fullscreenTrimBarRef,
  setFullscreenTrimCursorRatio,
  clamp,
  formatVideoTime,
  isFullscreenPlaying,
  isFullscreenMuted,
  fullscreenCurrentTime,
  fullscreenDuration,
  fullscreenTrimRange,
  hasFullscreenTrimChanges,
  isFullscreenTrimming,
  fullscreenTrimmedOutputPath,
  fullscreenTrimError,
  handleFullscreenVideoClick,
  onFullscreenPlay,
  onFullscreenPause,
  onFullscreenLoadedMetadata,
  onFullscreenTimeUpdate,
  handleFullscreenTogglePlayback,
  handleFullscreenToggleMute,
  seekFullscreenTo,
  handleFullscreenTrimBarClick,
  startFullscreenTrimDrag,
  handleFullscreenTrimApply,
  handleFullscreenTrimCancel,
  handleFullscreenTrimmedDragStart,
  handleFullscreenTrimmedDragEnd,
  handleDeleteFullscreenTrimmed,
}: FullscreenVideoModalProps) {
  if (!fullscreenVideo) {
    return null;
  }

  const controlButtonClass =
    "h-6 w-6 rounded-sm border-white/35 bg-black/65 text-white hover:bg-black/80 hover:text-white sm:h-7 sm:w-7";
  const secondaryButtonClass =
    "h-7 rounded-[6px] border-white/30 bg-black/55 px-2 text-[11px] text-white hover:bg-black/75 hover:text-white";
  const ghostActionButtonClass =
    "h-7 rounded-[6px] bg-black/50 px-2 text-[11px] text-white hover:bg-black/75 hover:text-white";

  return (
    <div
      className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.4),rgba(0,0,0,0.95))] flex items-center justify-center p-1.5 sm:p-3"
      onClick={closeFullscreen}
    >
      <div
        ref={fullscreenContainerRef}
        className="relative w-full max-w-6xl max-h-[calc(100vh-0.75rem)] overflow-y-auto rounded-xl border border-white/15 bg-black/40 p-2 sm:max-h-[calc(100vh-1.5rem)] sm:p-3 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={(event) => {
          if (!fullscreenContainerRef.current) return;
          const rect = fullscreenContainerRef.current.getBoundingClientRect();
          if (rect.width <= 0) return;
          const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
          setFullscreenTrimCursorRatio(ratio);
        }}
        onMouseLeave={() => setFullscreenTrimCursorRatio(null)}
      >
        <div className="mb-2 flex items-center justify-between gap-2 pr-10 sm:pr-12">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white sm:text-sm">
              {fullscreenVideo.filename}
            </p>
            <p className="text-[10px] text-white/70 sm:text-xs">
              {formatVideoTime(fullscreenVideo.duration_sec)}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full border border-white/20 bg-black/40 text-white hover:bg-black/70 sm:top-3 sm:right-3 sm:h-9 sm:w-9"
          onClick={closeFullscreen}
        >
          <span className="text-lg sm:text-xl">x</span>
        </Button>
        <video
          ref={fullscreenVideoRef}
          src={convertFileSrc(fullscreenVideo.original_path)}
          className="w-full max-h-[52vh] rounded-lg object-contain bg-black sm:max-h-[64vh] lg:max-h-[72vh]"
          autoPlay
          playsInline
          muted={isFullscreenMuted}
          onPlay={onFullscreenPlay}
          onPause={onFullscreenPause}
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration || 0;
            onFullscreenLoadedMetadata(duration);
          }}
          onTimeUpdate={(event) => {
            onFullscreenTimeUpdate(event.currentTarget.currentTime || 0);
          }}
          onClick={handleFullscreenVideoClick}
        />

        <div className="mt-2 rounded-lg border border-white/15 bg-black/35 p-1.5 sm:mt-3 sm:p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                size="icon-xs"
                variant="outline"
                className={controlButtonClass}
                onClick={handleFullscreenTogglePlayback}
                title={isFullscreenPlaying ? "Pause" : "Play"}
              >
                {isFullscreenPlaying ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </Button>
              <Button
                size="icon-xs"
                variant="outline"
                className={controlButtonClass}
                onClick={handleFullscreenToggleMute}
                title={isFullscreenMuted ? "Unmute" : "Mute"}
              >
                {isFullscreenMuted ? (
                  <VolumeX className="h-3 w-3" />
                ) : (
                  <Volume2 className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div className="rounded-sm border border-white/20 bg-black/55 px-1.5 py-0.5 text-[10px] text-white sm:text-[11px]">
              {formatVideoTime(fullscreenCurrentTime)} /{" "}
              {formatVideoTime(fullscreenDuration)}
            </div>
          </div>

          <div className="mb-1.5">
            <input
              type="range"
              min={0}
              max={fullscreenDuration || 0}
              step={0.1}
              value={Math.min(fullscreenCurrentTime, fullscreenDuration || 0)}
              onChange={(event) =>
                seekFullscreenTo(Number(event.currentTarget.value))
              }
              className="h-[3px] w-full accent-primary"
            />
          </div>

          <div
            ref={fullscreenTrimBarRef}
            className="relative h-[3px] rounded-full bg-background/80"
            onClick={handleFullscreenTrimBarClick}
            onMouseMove={(event) => {
              if (!fullscreenTrimBarRef.current) return;
              const rect = fullscreenTrimBarRef.current.getBoundingClientRect();
              if (rect.width <= 0) return;
              const ratio = clamp(
                (event.clientX - rect.left) / rect.width,
                0,
                1,
              );
              setFullscreenTrimCursorRatio(ratio);
            }}
            onMouseLeave={() => setFullscreenTrimCursorRatio(null)}
          >
            <div
              className="pointer-events-none absolute bottom-0 top-0 rounded-full bg-primary/90"
              style={{
                left: `${fullscreenTrimRange.start * 100}%`,
                width: `${(fullscreenTrimRange.end - fullscreenTrimRange.start) * 100}%`,
              }}
            />
            <button
              type="button"
              className="absolute top-1/2 z-10 h-3 w-2 -translate-y-1/2 border border-background bg-primary shadow"
              style={{
                left: `calc(${fullscreenTrimRange.start * 100}% - 6px)`,
              }}
              onMouseDown={(event) => startFullscreenTrimDrag("start", event)}
              aria-label="Fullscreen trim start handle"
            />
            <button
              type="button"
              className="absolute top-1/2 z-10 h-3 w-2 -translate-y-1/2 border border-background bg-primary shadow"
              style={{
                left: `calc(${fullscreenTrimRange.end * 100}% - 6px)`,
              }}
              onMouseDown={(event) => startFullscreenTrimDrag("end", event)}
              aria-label="Fullscreen trim end handle"
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {hasFullscreenTrimChanges && (
              <>
                <Button
                  size="sm"
                  className="h-7 rounded-[6px] bg-white text-black px-2 text-[11px] hover:bg-white/90"
                  disabled={isFullscreenTrimming}
                  onClick={handleFullscreenTrimApply}
                >
                  {isFullscreenTrimming ? "Applying..." : "Apply"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={secondaryButtonClass}
                  disabled={isFullscreenTrimming}
                  onClick={handleFullscreenTrimCancel}
                >
                  Cancel
                </Button>
              </>
            )}

            {fullscreenTrimmedOutputPath && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  draggable
                  className={ghostActionButtonClass}
                  onDragStart={handleFullscreenTrimmedDragStart}
                  onDragEnd={handleFullscreenTrimmedDragEnd}
                >
                  Drag
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={ghostActionButtonClass}
                  onClick={() =>
                    void revealItemInDir(fullscreenTrimmedOutputPath)
                  }
                >
                  Show
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-[6px] bg-red-950/55 px-2 text-[11px] text-red-200 hover:bg-red-900/80 hover:text-red-100"
                  onClick={() => void handleDeleteFullscreenTrimmed()}
                >
                  Delete
                </Button>
              </>
            )}
          </div>

          {fullscreenTrimError && (
            <div className="mt-2 rounded-[6px] bg-destructive/85 px-2 py-1 text-[11px] text-destructive-foreground">
              {fullscreenTrimError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
