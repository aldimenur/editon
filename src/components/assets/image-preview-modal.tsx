import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import type { Asset } from "@/types/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";

type ImagePreviewModalProps = {
  image: Asset | null;
  onClose: () => void;
};

export default function ImagePreviewModal({
  image,
  onClose,
}: ImagePreviewModalProps) {
  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="relative max-w-7xl max-h-full"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-10 w-10 text-white hover:bg-white/20 z-10"
          onClick={onClose}
        >
          <span className="text-2xl">x</span>
        </Button>

        <img
          src={convertFileSrc(image.original_path)}
          alt={image.filename}
          className="max-w-full max-h-[90vh] object-contain"
        />

        <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white p-3">
          <p className="font-medium mb-1">{image.filename}</p>
          <div className="flex gap-3 text-sm text-gray-300">
            <span>
              {image.metadata?.width && image.metadata?.height
                ? `${image.metadata.width} x ${image.metadata.height}`
                : "Unknown resolution"}
            </span>
            <span>{formatFileSize(image.file_size)}</span>
            {typeof image.metadata?.color_space === "string" && (
              <span>{image.metadata.color_space}</span>
            )}
            {typeof image.metadata?.codec === "string" && (
              <span>{image.metadata.codec.toUpperCase()}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
