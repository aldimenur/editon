import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

interface ProgressPayload {
  current?: number;
  total?: number;
  status?: string;
  count?: number;
  last_files?: string;
  name?: string;
}

interface UseEventListenersProps {
  onProgressSound: (payload: ProgressPayload) => void;
  onProgressImage: (payload: ProgressPayload) => void;
  onCountingTotalChange: (counting: boolean) => void;
  onUpdateAssetsCount: () => void;
  onScanProgressDone: () => void;
}

export const useEventListeners = ({
  onProgressSound,
  onProgressImage,
  onCountingTotalChange,
  onUpdateAssetsCount,
  onScanProgressDone
}: UseEventListenersProps) => {
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const setupListeners = async () => {
      try {
        // File change listeners
        unlisteners.push(
          await listen("file-added", () => {
            onUpdateAssetsCount();
          })
        );

        unlisteners.push(
          await listen("file-removed", () => {
            onUpdateAssetsCount();
          })
        );

        // Scan progress listener
        unlisteners.push(
          await listen("scan-progress", (event) => {
            const payload = event.payload as ProgressPayload;

            if (payload.status === "finished") {
              onCountingTotalChange(false);
              onScanProgressDone()
            }
          })
        );

        // Waveform progress listener
        unlisteners.push(
          await listen("waveform-progress", (event) => {
            const payload = event.payload as ProgressPayload;

            onProgressSound(payload);

            if (payload.status === "done") {
              onProgressSound(null as any);
            }
          })
        );

        // Thumbnail progress listener
        unlisteners.push(
          await listen("thumbnail-progress", (event) => {
            const payload = event.payload as ProgressPayload;

            onProgressImage(payload);

            if (payload.status === "done") {
              onProgressImage(null as any);
            }
          })
        );
      } catch (error) {
        console.error("Failed to setup event listeners:", error);
      }
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [onProgressSound, onProgressImage, onCountingTotalChange, onUpdateAssetsCount]);
};
