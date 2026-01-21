import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Play, Pause, LayoutList, LayoutGrid, Maximize2, Volume2, VolumeX, Maximize } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import { Slider } from "@/components/ui/slider";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { startDrag } from "@crabnebula/tauri-plugin-drag";

type ViewMode = "list" | "grid" | "large";

const ITEM_HEIGHTS = {
  list: 240,
  grid: 280,
  large: 400,
};

interface VideoState {
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
}

const VideoPage = () => {
  const { videoSearch, setVideoSearch, parentPath } = useAssetStore((state) => state);
  const [files, setFiles] = useState<Asset[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [pageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [sliderValue, setSliderValue] = useState(0.5);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [videoStates, setVideoStates] = useState<{ [key: number]: VideoState }>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<{ [key: number]: HTMLVideoElement }>({});
  const hasMore = files.length < searchCount;

  const readMediaFiles = async (pageParam: number, reset: boolean = false) => {
    if (!parentPath) return;
    try {
      setIsLoading(true);
      const result = await invoke<any>("get_assets_paginated", {
        page: pageParam,
        pageSize: pageSize,
        query: videoSearch || "",
        assetType: "video",
      });

      const assets = result.data || [];
      setFiles((prev) => (reset ? assets : [...prev, ...assets]));
      setSearchCount(result.total_items ?? 0);

      console.log("Loaded page", pageParam, "Total:", result.total_items, "Assets:", assets.length);

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // initial load / path change
  useEffect(() => {
    if (!parentPath) {
      setFiles([]);
      setSearchCount(0);
      return;
    }
    readMediaFiles(1, true);
  }, [parentPath]);

  // search
  useEffect(() => {
    if (!parentPath) return;
    setFiles([]);
    setSearchCount(0);

    const timeout = setTimeout(() => {
      readMediaFiles(1, true);
    }, 500);

    return () => clearTimeout(timeout);
  }, [videoSearch, parentPath]);

  // Calculate row count based on view mode
  const getRowCount = () => {
    if (viewMode === "grid") {
      return Math.ceil(files.length / 2);
    }
    return files.length;
  };

  const rowVirtualizer = useVirtualizer({
    count: getRowCount(),
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_HEIGHTS[viewMode],
    overscan: 5,
  });

  // infinite scroll with virtualizer
  useEffect(() => {
    if (!hasMore || isLoading || files.length === 0) return;

    const virtualItems = rowVirtualizer.getVirtualItems();
    if (!virtualItems.length) return;

    const lastItem = virtualItems[virtualItems.length - 1];

    // Calculate actual file index based on view mode
    const actualLastIndex = viewMode === "grid"
      ? (lastItem.index * 2) + 1  // In grid mode, each row has 2 items
      : lastItem.index;

    // when we scroll within a few items of the end, load next page
    if (actualLastIndex >= files.length - 5) {
      const nextPage = Math.floor(files.length / pageSize) + 1;
      console.log("Loading next page:", nextPage);
      readMediaFiles(nextPage);
    }
  }, [rowVirtualizer.getVirtualItems(), files.length, hasMore, isLoading, pageSize, viewMode]);

  // Update video volume when slider changes
  useEffect(() => {
    Object.values(videoRefs.current).forEach((video) => {
      if (video) {
        video.volume = sliderValue;
      }
    });
  }, [sliderValue]);

  // Reset scroll position when view mode changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewMode]);

  const handlePlayPause = (fileId: number) => {
    const video = videoRefs.current[fileId];
    if (!video) return;

    if (playingId === fileId) {
      video.pause();
      setPlayingId(null);
    } else {
      // Pause any currently playing video
      if (playingId !== null && videoRefs.current[playingId]) {
        videoRefs.current[playingId].pause();
      }
      video.play();
      setPlayingId(fileId);
    }
  };

  const handleTimeUpdate = (fileId: number, currentTime: number, duration: number) => {
    setVideoStates((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        currentTime,
        duration,
        volume: prev[fileId]?.volume ?? sliderValue,
        isMuted: prev[fileId]?.isMuted ?? false,
      },
    }));
  };

  const handleSeek = (fileId: number, value: number) => {
    const video = videoRefs.current[fileId];
    if (!video) return;
    video.currentTime = value;
  };

  const handleVolumeChange = (fileId: number, volume: number) => {
    const video = videoRefs.current[fileId];
    if (!video) return;
    video.volume = volume;
    setVideoStates((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], volume, isMuted: false },
    }));
  };

  const handleMuteToggle = (fileId: number) => {
    const video = videoRefs.current[fileId];
    if (!video) return;
    const newMuted = !video.muted;
    video.muted = newMuted;
    setVideoStates((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], isMuted: newMuted },
    }));
  };

  const handleFullscreen = (fileId: number) => {
    const video = videoRefs.current[fileId];
    if (!video) return;

    if (video.requestFullscreen) {
      video.requestFullscreen();
    }
  };

  const handleDragStart = (file: Asset) => {
    try {
      startDrag({
        item: [file.original_path],
        icon: file.original_path,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const renderVideoCard = (file: Asset, videoHeight: string, minHeight?: number) => {
    if (!file.id) return null;

    const isPlaying = playingId === file.id;
    const isHovered = hoveredId === file.id;
    const videoSrc = convertFileSrc(file.original_path);
    const videoState = videoStates[file.id] || {
      currentTime: 0,
      duration: 0,
      volume: sliderValue,
      isMuted: false
    };

    const progress = videoState.duration > 0
      ? (videoState.currentTime / videoState.duration) * 100
      : 0;

    return (
      <div
        key={file.id}
        className="border rounded-lg overflow-hidden bg-card"
        style={minHeight ? { minHeight } : undefined}
        onMouseEnter={() => setHoveredId(file.id ?? null)}
        onMouseLeave={() => setHoveredId(null)}
        onDragStart={(e) => e.preventDefault()}
        onDragEnd={(e) => e.preventDefault()}
      >
        <div className="relative group">
          {/* Video Player */}
          <video
            ref={(el) => {
              if (el && file.id) {
                videoRefs.current[file.id] = el;
              }
            }}
            src={videoSrc}
            className={`w-full ${videoHeight} object-contain bg-black`}
            onEnded={() => setPlayingId(null)}
            onPause={() => {
              if (playingId === file.id) setPlayingId(null);
            }}
            onPlay={() => {
              if (playingId !== file.id) setPlayingId(file.id ?? null);
            }}
            onTimeUpdate={(e) => {
              const video = e.currentTarget;
              handleTimeUpdate(file.id!, video.currentTime, video.duration);
            }}
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              handleTimeUpdate(file.id!, 0, video.duration);
            }}
          />

          {/* Custom Controls Overlay */}
          <div
            className={`absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300 ${isHovered || isPlaying ? 'opacity-100' : 'opacity-0'
              }`}
            draggable
            onDragStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              videoRefs.current[file.id!]?.pause();
              handleDragStart(file);
            }}
          >
            {/* Top Controls */}
            <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start">
              <div className="text-white text-xs font-medium drop-shadow-lg max-w-[70%] truncate">
                {file.filename}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFullscreen(file.id!);
                }}
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>

            {/* Center Play/Pause Button */}
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={() => handlePlayPause(file.id!)}
            >
              {isPlaying ? (
                <div className="bg-black/50 rounded-full p-4 hover:bg-black/70 transition-colors">
                  <Pause className="w-12 h-12 text-white drop-shadow-lg" />
                </div>
              ) : (
                <div className="bg-black/50 rounded-full p-4 hover:bg-black/70 transition-colors">
                  <Play className="w-12 h-12 text-white drop-shadow-lg ml-1" />
                </div>
              )}
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
              {/* Progress Bar */}
              <div className="relative group/progress">
                <div className="h-2 bg-white/30 rounded-full overflow-hidden cursor-pointer">
                  <div
                    className="h-full bg-primary transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max={videoState.duration || 100}
                  value={videoState.currentTime || 0}
                  onChange={(e) => handleSeek(file.id!, parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-1 opacity-0 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Play/Pause */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPause(file.id!);
                    }}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>

                  {/* Volume Control */}
                  <div className="flex items-center gap-2 group/volume">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMuteToggle(file.id!);
                      }}
                    >
                      {videoState.isMuted ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="w-0 group-hover/volume:w-20 overflow-hidden transition-all duration-200">
                      <Slider
                        value={[videoState.isMuted ? 0 : videoState.volume]}
                        min={0}
                        max={1}
                        step={0.1}
                        onValueChange={(value) => handleVolumeChange(file.id!, value[0])}
                        className="w-20"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  {/* Time Display */}
                  <div className="text-white text-xs font-medium">
                    {formatDuration(videoState.currentTime)} / {formatDuration(videoState.duration)}
                  </div>
                </div>

                {/* Fullscreen */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFullscreen(file.id!);
                  }}
                >
                  <Maximize className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Video Info */}
        <div className="p-2 bg-accent">
          <p className="text-xs font-medium mb-1 text-ellipsis overflow-hidden whitespace-nowrap">
            {file.filename}
          </p>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="truncate max-w-[70%]">{file.original_path}</span>
            <span>{formatFileSize(file.file_size)}</span>
          </div>
        </div>
      </div>
    );
  };

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  const showEmptyState = !isLoading && files.length === 0;

  return (
    <div className="px-4 relative">
      <div className="flex items-center justify-between gap-2">
        {/* View Mode Switcher */}
        <div className="flex gap-1 mr-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
            className="h-8 w-8"
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("grid")}
            className="h-8 w-8"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "large" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("large")}
            className="h-8 w-8"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Volume Control */}
        <div className="w-24 mr-2 flex items-center gap-2">
          <Volume2 className="h-6 w-6" />
          <Slider
            defaultValue={[sliderValue]}
            min={0}
            max={1}
            step={0.1}
            value={[sliderValue]}
            onValueChange={(value) => setSliderValue(value[0])}
          />
        </div>

        <div className="relative mb-2 flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search videos..."
            value={videoSearch}
            onChange={(e) => setVideoSearch(e.target.value)}
            className="pl-10 pr-10 text-sm"
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground rounded-md px-2 text-xs">
            {searchCount} Items
          </div>
        </div>
      </div>
      <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto">
        {showEmptyState ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {videoSearch
              ? "No videos found matching your search"
              : "No video files found"}
          </div>
        ) : (
          <div
            className="relative w-full"
              style={{ height: totalHeight || (isLoading ? ITEM_HEIGHTS[viewMode] : 0) }}
          >
            {!!virtualItems.length && (
              <div
                className="absolute left-0 right-0 space-y-2"
                style={{
                  transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  if (viewMode === "grid") {
                    // Grid mode: 2 columns
                    const file1 = files[virtualRow.index * 2];
                    const file2 = files[virtualRow.index * 2 + 1];

                    return (
                      <div
                        key={virtualRow.index}
                        className="grid grid-cols-2 gap-2"
                        style={{ minHeight: virtualRow.size }}
                      >
                        {file1 && renderVideoCard(file1, "h-52")}
                        {file2 && renderVideoCard(file2, "h-52")}
                      </div>
                    );
                  } else {
                    // List or Large mode: single column
                    const file = files[virtualRow.index];
                    if (!file) return null;

                    const videoHeight = viewMode === "large" ? "h-80" : "h-48";
                    return renderVideoCard(file, videoHeight, virtualRow.size);
                  }
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPage;