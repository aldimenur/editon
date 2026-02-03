import useAssetStore from "@/stores/asset-store";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
    Search,
    LayoutList,
    LayoutGrid,
    Maximize2,
    ZoomIn,
    Settings2,
    Tag,
    PencilLine,
    Trash,
    FolderSearch,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/types/tauri";
import { Button } from "@/components/ui/button";
import useViewStore from "@/stores/view-store";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { formatFileSize } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TagsDialog from "@/components/TagsDialog";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ITEM_HEIGHTS = {
    list: 240,
    grid: 280,
    large: 400,
};

const ImagePage = () => {
    const {
        imageSearch,
        setImageSearch,
        parentPath,
        imageFiles,
        imageSearchCount,
        isLoading,
        fetchImageAssets,
        image
    } = useAssetStore((state) => state);

    const [pageSize] = useState(30);
    const { viewModeImage, setViewModeImage } = useViewStore((state) => state);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [selectedImage, setSelectedImage] = useState<Asset | null>(null);
    const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
    const [assetToEdit, setAssetToEdit] = useState<{
        id: number;
        tags: string | null | undefined;
    } | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [fileToRename, setFileToRename] = useState<string | null>(null);
    const [newFileName, setNewFileName] = useState("");
    const [tagFilter, setTagFilter] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const hasMore = imageFiles.length < imageSearchCount;
    const rawImageSearch = imageSearch as unknown as {
        search?: string;
        filter?: { tags?: string };
    } | string | null | undefined;
    const imageSearchText =
        typeof rawImageSearch === "string"
            ? rawImageSearch
            : rawImageSearch?.search ?? "";

    // initial load / path change
    useEffect(() => {
        if (!parentPath) {
            return;
        }
        fetchImageAssets(1, pageSize, true);
    }, [parentPath, pageSize]);

    const fetchAvailableTags = useCallback(async () => {
        try {
            const tags = await invoke<string[]>("get_available_tags");
            setAvailableTags(tags);
            setTagFilter((prev) => prev.filter((tag) => tags.includes(tag)));
        } catch (error) {
            console.error("Failed to fetch tags:", error);
            setAvailableTags([]);
            setTagFilter([]);
        }
    }, []);

    // Fetch available tags from database
    useEffect(() => {
        if (!parentPath) return;
        fetchAvailableTags();
    }, [parentPath, fetchAvailableTags]);

    // search with debounce
    useEffect(() => {
        if (!parentPath) return;

        const timeout = setTimeout(() => {
            setImageSearch(imageSearchText, { tags: tagFilter.join(" ") });
            fetchImageAssets(1, pageSize, true);
        }, 500);

        return () => clearTimeout(timeout);
    }, [imageSearchText, tagFilter, parentPath, pageSize, image]);

    // Calculate row count based on view mode
    const getRowCount = () => {
        if (viewModeImage === "grid") {
            return Math.ceil(imageFiles.length / 3); // 3 columns for grid
        }
        return imageFiles.length;
    };

    const rowVirtualizer = useVirtualizer({
        count: getRowCount(),
        getScrollElement: () => containerRef.current,
        estimateSize: () => ITEM_HEIGHTS[viewModeImage],
        getItemKey: (index) => `${viewModeImage}-${index}`, // reset size cache when mode changes
        overscan: 10,
    });

    // compute virtual items once per render
    const virtualItems = rowVirtualizer.getVirtualItems();
    const totalHeight = rowVirtualizer.getTotalSize();
    // infinite scroll with virtualizer
    useEffect(() => {
        if (!hasMore || isLoading || imageFiles.length === 0) return;
        if (!virtualItems.length) return;

        const lastItem = virtualItems[virtualItems.length - 1];

        // Calculate actual file index based on view mode
        const actualLastIndex = viewModeImage === "grid"
            ? (lastItem.index * 3) + 2  // In grid mode, each row has 3 items
            : lastItem.index;

        // when we scroll within a few items of the end, load next page
        if (actualLastIndex >= imageFiles.length - 5) {
            const nextPage = Math.floor(imageFiles.length / pageSize) + 1;
            fetchImageAssets(nextPage, pageSize);
        }
    }, [virtualItems.length, imageFiles.length, hasMore, isLoading, pageSize, viewModeImage]);

    // Reset scroll position when view mode changes
    useEffect(() => {
        rowVirtualizer.measure(); // force recalculation with new item heights
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, [viewModeImage]);

    const closeModal = () => {
        setSelectedImage(null);
    };

    const highlightText = (text: string, search: string) => {
        if (typeof search !== "string" || !search.trim()) return text;

        // Tokenize search query: split by whitespace
        const tokens = search
            .split(/\s+/)
            .filter(token => token.trim().length > 0)
            .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex special chars

        if (tokens.length === 0) return text;

        // Create regex pattern that matches any token
        const pattern = new RegExp(`(${tokens.join('|')})`, 'gi');
        const parts = text.split(pattern);

        return (
            <>
                {parts.map((part, index) => {
                    // Check if this part matches any of the search tokens
                    const isMatch = tokens.some(
                        token => part.toLowerCase() === token.toLowerCase()
                    );

                    return isMatch ? (
                        <mark key={index} className="bg-yellow-300 dark:bg-yellow-600 text-foreground">
                            {part}
                        </mark>
                    ) : (
                        part
                    );
                })}
            </>
        );
    };

    const handleTagsClick = (assetId: number, tags: string | null | undefined) => {
        setAssetToEdit({ id: assetId, tags });
        setTagsDialogOpen(true);
    };

    const handleTagsUpdated = () => {
        fetchImageAssets(1, pageSize, true);
        fetchAvailableTags();
    };

    const handleDeleteClick = (path: string) => {
        setFileToDelete(path);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (fileToDelete) {
            await invoke("delete_file", { path: fileToDelete });
            setDeleteDialogOpen(false);
            setFileToDelete(null);
            fetchImageAssets(1, pageSize, true);
        }
    };

    const handleRenameClick = (path: string, currentName: string) => {
        setFileToRename(path);
        const lastDotIndex = currentName.lastIndexOf(".");
        const nameWithoutExt =
            lastDotIndex > 0 ? currentName.substring(0, lastDotIndex) : currentName;
        setNewFileName(nameWithoutExt);
        setRenameDialogOpen(true);
    };

    const handleRenameConfirm = async () => {
        if (fileToRename && newFileName.trim()) {
            try {
                const originalFilename = fileToRename.split(/[\\/]/).pop() || "";
                const lastDotIndex = originalFilename.lastIndexOf(".");
                const extension =
                    lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : "";

                const newFullName = newFileName.trim() + extension;

                await invoke("rename_file", {
                    oldPath: fileToRename,
                    newName: newFullName,
                });
                setRenameDialogOpen(false);
                setFileToRename(null);
                setNewFileName("");
                fetchImageAssets(1, pageSize, true);
            } catch (error) {
                console.error("Failed to rename file:", error);
            }
        }
    };

    const handleRenameCancel = () => {
        setRenameDialogOpen(false);
        setFileToRename(null);
        setNewFileName("");
    };

    const renderTags = (tags: string | null | undefined) => {
        if (!tags) return null;
        const tagArray = tags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0);
        if (tagArray.length === 0) return null;

        return (
            <div className="flex flex-wrap gap-1 mt-1">
                {tagArray.slice(0, 3).map((tag, index) => (
                    <span
                        key={index}
                        className="bg-primary/10 text-primary px-1 py-0.5 rounded text-xs"
                    >
                        {tag}
                    </span>
                ))}
                {tagArray.length > 3 && (
                    <span className="text-muted-foreground text-xs">
                        +{tagArray.length - 3}
                    </span>
                )}
            </div>
        );
    };

    const renderImageCard = (file: Asset, imageHeight: string, minHeight: number) => {
        const isHovered = hoveredId === file.id;
        const imageSrc = file.thumbnail_path ? convertFileSrc(file.thumbnail_path) : "";

        return (
            <div
                key={file.id}
                className="group border rounded-lg overflow-hidden bg-card transition-all hover:shadow-lg"
                style={{ minHeight }}
            >
                <div className="relative">
                    {/* Image */}
                    <img
                        src={imageSrc}
                        alt={file.filename}
                        className={`w-full ${imageHeight} object-cover bg-muted`}
                        loading="lazy"
                        decoding="async"
                    />

                    {/* Hover Overlay */}
                    <div
                        onMouseEnter={() => setHoveredId(file.id ?? null)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => setSelectedImage(file)}
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
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-ellipsis overflow-hidden whitespace-nowrap">
                            {highlightText(file.filename, imageSearchText)}
                        </p>
                        <div className="flex items-center gap-1 rounded-md border bg-background/80 p-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                className="rounded-sm"
                                onClick={() => {
                                    if (file.id == null) return;
                                    handleTagsClick(file.id, file.tags);
                                }}
                            >
                                <Tag className="h-2 w-2" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                className="rounded-sm"
                                onClick={() => handleRenameClick(file.original_path, file.filename)}
                            >
                                <PencilLine className="h-2 w-2" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                className="rounded-sm"
                                onClick={() => revealItemInDir(file.original_path)}
                            >
                                <FolderSearch className="h-2 w-2" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                className="rounded-sm text-destructive hover:text-destructive"
                                onClick={() => handleDeleteClick(file.original_path)}
                            >
                                <Trash className="h-2 w-2" />
                            </Button>
                        </div>
                    </div>
                    {renderTags(file.tags)}
                    <div className="flex flex-col">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                                {file.metadata?.width && file.metadata?.height
                                    ? `${file.metadata.width}x${file.metadata.height}`
                                    : "Unknown"}
                            </span>
                            <span>{formatFileSize(file.file_size)}</span>
                            {file.metadata?.color_space && viewModeImage !== "grid" && (
                                <span>{file.metadata.color_space}</span>
                            )}
                        </div>
                        <span className="text-xs cursor-pointer truncate w-3/4 text-primary" onClick={() => revealItemInDir(file.original_path)}>
                            {file.original_path}
                        </span>
                    </div>
                </div>
            </div>
        );
    };


    const showEmptyState = !isLoading && imageFiles.length === 0;

    return (
        <div className="px-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                {/* View Mode Switcher - Desktop */}
                <div className="hidden md:flex gap-1 mr-2">
                    <Button
                        variant={viewModeImage === "list" ? "default" : "outline"}
                        size="icon"
                        onClick={() => setViewModeImage("list")}
                        className="h-8 w-8"
                    >
                        <LayoutList className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewModeImage === "grid" ? "default" : "outline"}
                        size="icon"
                        onClick={() => setViewModeImage("grid")}
                        className="h-8 w-8"
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewModeImage === "large" ? "default" : "outline"}
                        size="icon"
                        onClick={() => setViewModeImage("large")}
                        className="h-8 w-8"
                    >
                        <Maximize2 className="h-4 w-4" />
                    </Button>
                </div>

                {/* Mobile Popup Menu */}
                <div className="md:hidden mr-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8">
                                <Settings2 className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuLabel>View Settings</DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            {/* View Mode Section */}
                            <div className="px-2 py-2">
                                <p className="text-xs font-medium text-muted-foreground mb-2">View Mode</p>
                                <div className="flex gap-2">
                                    <Button
                                        variant={viewModeImage === "list" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setViewModeImage("list")}
                                        className="flex-1"
                                    >
                                        <LayoutList className="h-4 w-4 mr-1" />
                                        List
                                    </Button>
                                    <Button
                                        variant={viewModeImage === "grid" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setViewModeImage("grid")}
                                        className="flex-1"
                                    >
                                        <LayoutGrid className="h-4 w-4 mr-1" />
                                        Grid
                                    </Button>
                                    <Button
                                        variant={viewModeImage === "large" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setViewModeImage("large")}
                                        className="flex-1"
                                    >
                                        <Maximize2 className="h-4 w-4 mr-1" />
                                        Large
                                    </Button>
                                </div>
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        type="text"
                        placeholder="Search..."
                        value={imageSearchText}
                        onChange={(e) =>
                            setImageSearch(e.target.value, { tags: tagFilter.join(" ") })
                        }
                        className="pl-10 pr-10 text-sm"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground rounded-xl px-2 py-1 text-xs">
                        {imageSearchCount}
                    </div>
                </div>

                {/* Tag Filter */}
                {availableTags.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                                <Tag className="h-4 w-4" />
                                {tagFilter.length > 0
                                    ? `${tagFilter.length} selected`
                                    : "Filter by tag"}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Filter by Tags</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                                checked={tagFilter.length === 0}
                                onCheckedChange={() => setTagFilter([])}
                            >
                                All Tags
                            </DropdownMenuCheckboxItem>
                            {availableTags.map((tag) => (
                                <DropdownMenuCheckboxItem
                                    key={tag}
                                    checked={tagFilter.includes(tag)}
                                    onCheckedChange={() => {
                                        if (tagFilter.includes(tag)) {
                                            setTagFilter(tagFilter.filter((t) => t !== tag));
                                        } else {
                                            setTagFilter([...tagFilter, tag]);
                                        }
                                    }}
                                >
                                    {tag}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            <div ref={containerRef} className="h-[calc(100vh-80px)] overflow-y-auto">
                {showEmptyState ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                        {imageSearchText
                            ? "No images found matching your search"
                            : "No image files found"}
                    </div>
                ) : (
                    <div
                        className="relative w-full"
                        style={{ height: totalHeight || (isLoading ? ITEM_HEIGHTS[viewModeImage] : 0) }}
                    >
                        {!!virtualItems.length && (
                            <div
                                className={`absolute left-0 right-0 space-y-2`}
                                style={{
                                    transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                                }}
                            >
                                {virtualItems.map((virtualRow) => {
                                    if (viewModeImage === "grid") {
                                        // Grid mode: 3 columns
                                        const file1 = imageFiles[virtualRow.index * 3];
                                        const file2 = imageFiles[virtualRow.index * 3 + 1];
                                        const file3 = imageFiles[virtualRow.index * 3 + 2];

                                        return (
                                            <div
                                                key={virtualRow.index}
                                                className="grid grid-cols-3 gap-2"
                                                style={{ minHeight: virtualRow.size }}
                                            >
                                                {file1 && renderImageCard(file1, "h-52", virtualRow.size)}
                                                {file2 && renderImageCard(file2, "h-52", virtualRow.size)}
                                                {file3 && renderImageCard(file3, "h-52", virtualRow.size)}
                                            </div>
                                        );
                                    } else {
                                        // List or Large mode: single column
                                        const file = imageFiles[virtualRow.index];
                                        if (!file) return null;

                                        const imageHeight = viewModeImage === "large" ? "h-80" : "h-48";
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

            <TagsDialog
                open={tagsDialogOpen}
                onOpenChange={setTagsDialogOpen}
                assetId={assetToEdit?.id || 0}
                currentTags={assetToEdit?.tags || null}
                availableTags={availableTags}
                onTagsUpdated={handleTagsUpdated}
            />

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            file from your system.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteConfirm}>
                            Delete
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Rename File</AlertDialogTitle>
                        <AlertDialogDescription>
                            Enter a new name for the file.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleRenameConfirm();
                            } else if (e.key === "Escape") {
                                handleRenameCancel();
                            }
                        }}
                        placeholder="New file name"
                        className="mt-2"
                        autoFocus
                    />
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={handleRenameCancel}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRenameConfirm}
                            disabled={!newFileName.trim()}
                        >
                            Rename
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ImagePage;
