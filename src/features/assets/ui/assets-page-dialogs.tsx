import TagsDialog from "@/components/TagsDialog";
import ImagePreviewModal from "@/components/assets/image-preview-modal";
import VideoPreviewModal from "@/components/assets/video-preview-modal";
import type { Asset } from "@/types/tauri";

type AssetsPageDialogsProps = {
  selectedImage: Asset | null;
  selectedVideo: Asset | null;
  onCloseImagePreview: () => void;
  onCloseVideoPreview: () => void;
  tagsDialogOpen: boolean;
  onTagsDialogOpenChange: (open: boolean) => void;
  tagsDialogAssetIds: number[];
  tagsDialogCurrentTags: string | null;
  availableTags: string[];
  onTagsUpdated: () => void;
};

export default function AssetsPageDialogs({
  selectedImage,
  selectedVideo,
  onCloseImagePreview,
  onCloseVideoPreview,
  tagsDialogOpen,
  onTagsDialogOpenChange,
  tagsDialogAssetIds,
  tagsDialogCurrentTags,
  availableTags,
  onTagsUpdated,
}: AssetsPageDialogsProps) {
  return (
    <>
      <ImagePreviewModal image={selectedImage} onClose={onCloseImagePreview} />
      <VideoPreviewModal video={selectedVideo} onClose={onCloseVideoPreview} />

      <TagsDialog
        open={tagsDialogOpen}
        onOpenChange={onTagsDialogOpenChange}
        assetIds={tagsDialogAssetIds}
        currentTags={tagsDialogCurrentTags}
        availableTags={availableTags}
        onTagsUpdated={onTagsUpdated}
      />
    </>
  );
}
