import { convertFileSrc } from "@tauri-apps/api/core";
import { useRef, useEffect, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { startDrag } from "@crabnebula/tauri-plugin-drag";

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
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Generate 10 numbers between -1 and 1
    const placeholderPeaks = waveform.length > 0 ? waveform : [0, 0, 0.2, 0.3, 0.5, 0.3, 0.5, 0.6, -1, -0.5, 0, -0.2, 1, 0.5, 0];

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#11ddaa",
      width: width,
      height: height,
      cursorColor: "#ffffff55",
      backend: "MediaElement",
      peaks: [placeholderPeaks],
      duration: 10,
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
    isHoveringRef.current = false;
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
    // Jika src berubah, pastikan audio yang sedang loading/playing berhenti
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
    }
  }, [src]);

  const handleMouseEnter = async () => {
    isHoveringRef.current = true;

    hoverTimeoutRef.current = setTimeout(async () => {
      // CEK 1: Jangan lanjut jika mouse sudah keburu pergi sebelum 300ms
      if (!isHoveringRef.current || !wavesurferRef.current) return;

      if (!isLoadedRef.current) {
        setIsLoading(true);
        try {
          await wavesurferRef.current.load(convertFileSrc(src));
          isLoadedRef.current = true;
        } catch (error) {
          console.error("Gagal memuat audio:", error);
        } finally {
          setIsLoading(false);
        }
      }
      // CEK 2: Penting! Cek lagi apakah mouse masih di sana setelah loading selesai
      // (Terutama untuk file besar yang butuh waktu loading lama)
      if (isHoveringRef.current && wavesurferRef.current) {
        wavesurferRef.current.play();
      }
    }, 300);
  };

  const handleMouseLeave = async () => {
    isHoveringRef.current = false; // Set status hover tidak aktif

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
      className="cursor-pointer active:cursor-grabbing w-full relative"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#11ddaa]"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WavesurferRender;
