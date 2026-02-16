import { convertFileSrc } from "@tauri-apps/api/core";
import { useRef, useEffect, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { useTheme } from "./theme-provider";
import { globalAudioPlayer } from "@/lib/global-audio-player";
import { applyDragImage, getDragPreviewIcon } from "@/lib/drag-preview";

const WavesurferRender = (props: {
  src: string;
  width: number | string;
  height: number | string;
  waveform: number[];
  volume: number;
  enableDrag?: boolean;
  onPositionChange?: (ratio: number) => void;
}) => {
  const {
    src,
    width,
    height,
    waveform,
    volume,
    enableDrag = true,
    onPositionChange,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadedRef = useRef(false);
  const { theme } = useTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    if (!containerRef.current) return;

    const placeholderPeaks =
      waveform.length > 0
        ? waveform
        : [0, 0, 0.2, 0.3, 0.5, 0.3, 0.5, 0.6, -1, -0.5, 0, -0.2, 1, 0.5, 0];

    const resolvedWaveHeight =
      typeof height === "number"
        ? height
        : (containerRef.current.parentElement?.clientHeight ?? 64);

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: isDark ? "#60a5fa" : "#3b82f6",
      progressColor: isDark ? "#555" : "#aaa",
      cursorWidth: 4,
      width: width,
      height: resolvedWaveHeight,
      cursorColor: "#ff000080",
      backend: "MediaElement",
      peaks: [placeholderPeaks],
      duration: 1,
    });

    wavesurferRef.current = wavesurfer;
    isLoadedRef.current = false;

    return () => {
      wavesurfer.destroy();
    };
  }, [width, height, isDark]);

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!enableDrag) return;
    e.preventDefault();
    wavesurferRef.current?.pause();

    const dragPreview = getDragPreviewIcon(src, "Dragging audio");
    applyDragImage(e.dataTransfer, dragPreview, src);

    try {
      startDrag({
        item: [src],
        icon: dragPreview || src,
        mode: "copy",
      });
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(volume);
    }
  }, [volume]);

  useEffect(() => {
    isLoadedRef.current = false;
    // If src changes, ensure audio that is loading/playing is stopped
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
    }
  }, [src]);

  useEffect(() => {
    const wavesurfer = wavesurferRef.current;
    if (!wavesurfer) return;

    const handleFinish = () => { };

    wavesurfer.on("finish", handleFinish);

    return () => {
      wavesurfer.un("finish", handleFinish);
    };
  }, []);

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't interfere with drag events
    if (e.defaultPrevented) return;

    if (!wavesurferRef.current || !containerRef.current) return;

    // Calculate click position relative to waveform
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPosition = clickX / rect.width;
    onPositionChange?.(clickPosition);

    // Load audio if not loaded
    if (!isLoadedRef.current) {
      setIsLoading(true);
      try {
        await wavesurferRef.current.load(convertFileSrc(src));
        isLoadedRef.current = true;
      } catch (error) {
        console.error("Failed to load audio:", error);
        setIsLoading(false);
        return;
      } finally {
        setIsLoading(false);
      }
    }

    wavesurferRef.current.seekTo(clickPosition);
    globalAudioPlayer.play(wavesurferRef.current);
    wavesurferRef.current.play();
  };

  const resolvedHeight =
    height === "auto"
      ? undefined
      : typeof height === "number"
        ? `${height}px`
        : height;

  return (
    <div
      className="cursor-pointer active:cursor-grabbing w-full relative"
      draggable={enableDrag}
      onDragStart={enableDrag ? handleDragStart : undefined}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onMouseLeave={() => wavesurferRef.current?.pause()}
      style={{ height: resolvedHeight }}
    >
      <div
        ref={containerRef}
        // className="bg-accent/60"
        style={{
          visibility: isLoading ? "hidden" : "visible",
          height: resolvedHeight,
          minHeight: resolvedHeight,
        }}
      />
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 bg-background/50"
          style={{ height: resolvedHeight }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WavesurferRender;
