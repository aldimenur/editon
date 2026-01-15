import { convertFileSrc } from "@tauri-apps/api/core";
import { useRef, useEffect, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { startDrag } from "@crabnebula/tauri-plugin-drag";

const WavesurferRender = (props: {
  src: string;
  width: number | string;
  height: number;
}) => {
  const { src, width, height } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      url: convertFileSrc(src),
      waveColor: "#11ddaa",
      width: width,
      height: height,
      cursorColor: "#ffffff55",
    });

    wavesurfer.on("click", () => {
      wavesurfer.play();
    });

    wavesurfer.on("ready", () => {
      setIsLoading(false);
    });

    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
    };
  }, [src]);

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      startDrag({
        item: [src],
        icon: src,
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div
      className="cursor-grab active:cursor-grabbing relative"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
      <div ref={containerRef} />
    </div>
  );
};

export default WavesurferRender;
