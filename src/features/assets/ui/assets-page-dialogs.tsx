import TagsDialog from "@/components/TagsDialog";
import ImagePreviewModal from "@/components/assets/image-preview-modal";
import type { Asset } from "@/types/tauri";

type AssetsPageDialogsProps = {
  selectedImage: Asset | null;
  onCloseImagePreview: () => void;
  tagsDialogOpen: boolean;
  onTagsDialogOpenChange: (open: boolean) => void;
  tagsDialogAssetIds: number[];
  tagsDialogCurrentTags: string | null;
  availableTags: string[];
  onTagsUpdated: () => void;
};

export default function AssetsPageDialogs({
  selectedImage,
  onCloseImagePreview,
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
