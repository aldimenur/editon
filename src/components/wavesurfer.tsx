import { convertFileSrc } from "@tauri-apps/api/core";
import { useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";

const WavesurferRender = (props: {
  src: string;
  width: number | string;
  height: number;
}) => {
  const { src, width, height } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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

    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
    };
  }, [src]);

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    >
      <div ref={containerRef} />
    </div>
  );
};

export default WavesurferRender;
