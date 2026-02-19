import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import type { Asset } from "@/types/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { X } from "lucide-react";

type VideoPreviewModalProps = {
  video: Asset | null;
  onClose: () => void;
};

export default function VideoPreviewModal({
  video,
  onClose,
}: VideoPreviewModalProps) {
  if (!video) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-white/15 bg-black/70 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/15 bg-black/45 px-3 py-2 text-white sm:px-4">
          <p className="truncate text-sm font-medium sm:text-base">
            {video.filename}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white hover:bg-white/15"
            onClick={onClose}
            title="Close preview"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex-1 bg-black">
          <video
            src={convertFileSrc(video.original_path)}
            className="h-full max-h-[78vh] w-full object-contain"
            controls
            autoPlay
            playsInline
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/15 bg-black/55 px-3 py-2 text-xs text-white/85 sm:px-4 sm:text-sm">
          {video.metadata?.width && video.metadata?.height ? (
            <span>
              {video.metadata.width} x {video.metadata.height}
            </span>
          ) : (
            <span>Unknown resolution</span>
          )}
          <span>{formatFileSize(video.file_size)}</span>
          {typeof video.duration_sec === "number" && video.duration_sec > 0 && (
            <span>{Math.round(video.duration_sec)}s</span>
          )}
          {typeof video.metadata?.codec === "string" && (
            <span>{video.metadata.codec.toUpperCase()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
