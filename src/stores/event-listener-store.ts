import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import useAssetStore from "./asset-store";

export interface ProgressPayload {
  current?: number;
  total?: number;
  status?: string;
  count?: number;
  last_files?: string;
  name?: string;
}

interface EventListenerStore {
  progressSound: ProgressPayload | null;
  progressImage: ProgressPayload | null;
  countingTotal: boolean;

  setProgressSound: (payload: ProgressPayload | null) => void;
  setProgressImage: (payload: ProgressPayload | null) => void;
  setCountingTotal: (counting: boolean) => void;

  /** Sets up Tauri event listeners. Called at app boot in main.tsx; active until app closes. */
  initEventListeners: () => Promise<void>;
}

const handleFileChanges = async () => {
  const updateAssetsCount = useAssetStore.getState().updateAssetsCount;
  const refetchAssets = useAssetStore.getState().refetchAssets;

  await updateAssetsCount();
  await refetchAssets();
  try {
    const thumb = await invoke("generate_missing_thumbnails");
    console.log("thumb", thumb);
    const wav = await invoke("generate_missing_waveforms");
    console.log("wav", wav);
    const vid = await invoke("generate_missing_video_thumbnails");
    console.log(vid);
  } catch (error) {
    console.error("Error generating thumbnails/waveforms:", error);
  }
};

const useEventListenerStore = create<EventListenerStore>()((set) => ({
  progressSound: null,
  progressImage: null,
  countingTotal: false,

  setProgressSound: (payload) => set({ progressSound: payload }),
  setProgressImage: (payload) => set({ progressImage: payload }),
  setCountingTotal: (counting) => set({ countingTotal: counting }),

  initEventListeners: async () => {
    try {
      await listen("file-added", () => handleFileChanges());
      await listen("file-removed", () => handleFileChanges());
      await listen("file-renamed", () => handleFileChanges());

      await listen("scan-progress", (event) => {
        const payload = event.payload as ProgressPayload;
        if (payload.status === "finished") {
          set({ countingTotal: false });
          handleFileChanges();
        }
        console.log(payload);
      });

      await listen("waveform-progress", (event) => {
        const payload = event.payload as ProgressPayload;
        set({ progressSound: payload });
        if (payload.status === "done") {
          set({ progressSound: null });
          handleFileChanges();
        }
      });

      await listen("thumbnail-progress", (event) => {
        const payload = event.payload as ProgressPayload;
        set({ progressImage: payload });
        if (payload.status === "done") {
          set({ progressImage: null });
          handleFileChanges();
        }
      });
    } catch (error) {
      console.error("Failed to setup event listeners:", error);
    }
  },
}));

export default useEventListenerStore;
