import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, LayoutList, LayoutGrid, Maximize2, ZoomIn } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { startDrag } from "@crabnebula/tauri-plugin-drag";

type ViewMode = "list" | "grid" | "large";

const ITEM_HEIGHTS = {
    list: 240,
    grid: 280,
    large: 400,
};

const ImagePage = () => {
    const { imageSearch, setImageSearch, parentPath } = useAssetStore((state) => state);
    const [files, setFiles] = useState<Asset[]>([]);
    const [searchCount, setSearchCount] = useState(0);
    const [pageSize] = useState(30);
    const [isLoading, setIsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [selectedImage, setSelectedImage] = useState<Asset | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const hasMore = files.length < searchCount;

    const readMediaFiles = async (pageParam: number, reset: boolean = false) => {
        if (!parentPath) return;
        try {
            setIsLoading(true);
            const result = await invoke<any>("get_assets_paginated", {
                page: pageParam,
                pageSize: pageSize,
                query: imageSearch || "",
                assetType: "image",
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
    }, [imageSearch, parentPath]);

    // Calculate row count based on view mode
    const getRowCount = () => {
        if (viewMode === "grid") {
            return Math.ceil(files.length / 3); // 3 columns for grid
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
            ? (lastItem.index * 3) + 2  // In grid mode, each row has 3 items
            : lastItem.index;

        // when we scroll within a few items of the end, load next page
        if (actualLastIndex >= files.length - 5) {
            const nextPage = Math.floor(files.length / pageSize) + 1;
            console.log("Loading next page:", nextPage);
            readMediaFiles(nextPage);
        }
    }, [rowVirtualizer.getVirtualItems(), files.length, hasMore, isLoading, pageSize, viewMode]);

    // Reset scroll position when view mode changes
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, [viewMode]);

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const handleImageClick = (file: Asset) => {
        setSelectedImage(file);
    };

    const handleDragStart = (file: Asset) => {
        try {
            startDrag({
                item: [file.original_path],
                icon: "",
            });
        } catch (error) {
            console.error(error);
        }
    };

    const closeModal = () => {
        setSelectedImage(null);
    };

    const renderImageCard = (file: Asset, imageHeight: string, minHeight?: number) => {
        if (!file.id) return null;

        const isHovered = hoveredId === file.id;
        const imageSrc = file.thumbnail_path ? convertFileSrc(file.thumbnail_path) : "";

        return (
            <div
                key={file.id}
                className="border rounded-lg overflow-hidden bg-card cursor-pointer transition-all hover:shadow-lg"
                style={minHeight ? { minHeight } : undefined}
                onMouseEnter={() => setHoveredId(file.id ?? null)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleImageClick(file)}
                onDragStart={(e) => { e.preventDefault(); handleDragStart(file) }}
                onDragEnd={(e) => e.preventDefault()}
                draggable
            >
                <div className="relative group">
                    {/* Image */}
                    <img
                        src={imageSrc}
                        alt={file.filename}
                        className={`w-full ${imageHeight} object-cover bg-muted`}
                        loading="lazy"
                    />

                    {/* Hover Overlay */}
                    <div
                        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 flex items-center justify-center ${isHovered ? 'opacity-100' : 'opacity-0'
                            }`}
                    >
                        <div className="text-center space-y-2">
                            <ZoomIn className="w-12 h-12 text-white mx-auto drop-shadow-lg" />
                            <p className="text-white text-sm font-medium px-2">Click to view</p>
                        </div>
                    </div>
                </div>

                {/* Image Info */}
                <div className="p-2 bg-accent">
                    <p className="text-xs font-medium mb-1 text-ellipsis overflow-hidden whitespace-nowrap">
                        {file.filename}
                    </p>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                            {file.metadata?.width && file.metadata?.height
                                ? `${file.metadata.width}x${file.metadata.height}`
                                : "Unknown"}
                        </span>
                        <span>{formatFileSize(file.file_size)}</span>
                        {file.metadata?.color_space && viewMode !== "grid" && (
                            <span>{file.metadata.color_space}</span>
                        )}
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

                <div className="relative mb-2 flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        type="text"
                        placeholder="Search images..."
                        value={imageSearch}
                        onChange={(e) => setImageSearch(e.target.value)}
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
                        {imageSearch
                            ? "No images found matching your search"
                            : "No image files found"}
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
                                        // Grid mode: 3 columns
                                        const file1 = files[virtualRow.index * 3];
                                        const file2 = files[virtualRow.index * 3 + 1];
                                        const file3 = files[virtualRow.index * 3 + 2];

                                        return (
                                            <div
                                                key={virtualRow.index}
                                                className="grid grid-cols-3 gap-2"
                                                style={{ minHeight: virtualRow.size }}
                                            >
                                                {file1 && renderImageCard(file1, "h-52")}
                                                {file2 && renderImageCard(file2, "h-52")}
                                                {file3 && renderImageCard(file3, "h-52")}
                                            </div>
                                        );
                                    } else {
                                        // List or Large mode: single column
                                        const file = files[virtualRow.index];
                                        if (!file) return null;

                                        const imageHeight = viewMode === "large" ? "h-80" : "h-48";
                                        return renderImageCard(file, imageHeight, virtualRow.size);
                                    }
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Image Preview Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                    onClick={closeModal}
                >
                    <div className="relative max-w-7xl max-h-full" onClick={(e) => e.stopPropagation()}>
                        {/* Close Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-10 w-10 text-white hover:bg-white/20 z-10"
                            onClick={closeModal}
                        >
                            <span className="text-2xl">×</span>
                        </Button>

                        {/* Image */}
                        <img
                            src={convertFileSrc(selectedImage.original_path)}
                            alt={selectedImage.filename}
                            className="max-w-full max-h-[90vh] object-contain"
                        />

                        {/* Image Info Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white p-4">
                            <p className="font-medium mb-2">{selectedImage.filename}</p>
                            <div className="flex gap-4 text-sm text-gray-300">
                                <span>
                                    {selectedImage.metadata?.width && selectedImage.metadata?.height
                                        ? `${selectedImage.metadata.width} × ${selectedImage.metadata.height}`
                                        : "Unknown resolution"}
                                </span>
                                <span>{formatFileSize(selectedImage.file_size)}</span>
                                {selectedImage.metadata?.color_space && (
                                    <span>{selectedImage.metadata.color_space}</span>
                                )}
                                {selectedImage.metadata?.codec && (
                                    <span>{selectedImage.metadata.codec.toUpperCase()}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImagePage;
