import { convertFileSrc } from "@tauri-apps/api/core";
import { useRef, useEffect, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { startDrag } from "@crabnebula/tauri-plugin-drag";

const WavesurferRender = (props: {
  src: string;
  width: number | string;
  height: number;
  waveform: number[];
  volume: number;
}) => {
  const { src, width, height, waveform, volume } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadedRef = useRef(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Generate 10 numbers between -1 and 1
    const placeholderPeaks = waveform.length > 0 ? waveform : [0, 0, 0.2, 0.3, 0.5, 0.3, 0.5, 0.6 , -1, -0.5, 0, -0.2, 1, 0.5 , 0];
    const duration = 5;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#11ddaa",
      width: width,
      height: height,
      cursorColor: "#ffffff55",
      backend: "MediaElement",
      peaks: [placeholderPeaks],
      duration: duration,
    });

    wavesurferRef.current = wavesurfer;
    isLoadedRef.current = false;

    return () => {
      wavesurfer.destroy();
    };
  }, [width, height]);

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
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

  const handleMouseEnter = async () => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Wait 1 second before detecting the mouse
    hoverTimeoutRef.current = setTimeout(async () => {
      if (wavesurferRef.current) {
        if (!isLoadedRef.current) {
          setIsLoading(true);
          await wavesurferRef.current.load(convertFileSrc(src));
          isLoadedRef.current = true;
          setIsLoading(false);
          wavesurferRef.current.play();
        } else {
          wavesurferRef.current.play();
        }
      }
    }, 100);
  };

  const handleMouseLeave = async () => {
    // Clear the timeout if mouse leaves before 1 second
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
    }
  };

  return (
    <div
      className="cursor-pointer active:cursor-grabbing relative"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={containerRef}
        style={{ visibility: isLoading ? "hidden" : "visible" }}
      />
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{ width: width, height: height }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#11ddaa]"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WavesurferRender;
