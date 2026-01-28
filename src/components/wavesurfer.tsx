import { convertFileSrc } from "@tauri-apps/api/core";
import { useRef, useEffect, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { useTheme } from "./theme-provider";

const WavesurferRender = (props: {
  src: string;
  width: number | string;
  height: number | "auto";
  waveform: number[];
  volume: number;
}) => {
  const { src, width, height, waveform, volume } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadedRef = useRef(false);
  const { theme } = useTheme();
  const isDark = theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    if (!containerRef.current) return;

    const placeholderPeaks = waveform.length > 0 ? waveform : [0, 0, 0.2, 0.3, 0.5, 0.3, 0.5, 0.6, -1, -0.5, 0, -0.2, 1, 0.5, 0];

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#3b82f6",
      progressColor: isDark ? "#374151" : "#d1d5db",
      width: width,
      height: height,
      cursorColor: "#ffffff55",
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
    e.preventDefault();
    wavesurferRef.current?.pause();
    try {
      startDrag({
        item: [src],
        icon: src,
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

    const handleFinish = () => {
    };

    wavesurfer.on('finish', handleFinish);

    return () => {
      wavesurfer.un('finish', handleFinish);
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
    wavesurferRef.current.play();
  };

  return (
    <div
      className="cursor-pointer active:cursor-grabbing w-full relative"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onMouseLeave={() => wavesurferRef.current?.pause()}
      style={{ height: height }}
    >
      <div
        ref={containerRef}
        className="w-full overflow-hidden h-fit"
        style={{
          visibility: isLoading ? "hidden" : "visible",
          height: height,
          minHeight: height
        }}
      />
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 bg-background/50"
          style={{ height: height }}
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
