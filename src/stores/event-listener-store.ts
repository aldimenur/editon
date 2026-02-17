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

type ProcessingResponse = {
  message: string;
  status: string;
};

const REFRESH_DEBOUNCE_MS = 350;

let refreshTimer: number | null = null;
let refreshInFlight = false;
let refreshQueued = false;
let queuedMaintenance = false;

function toProgressPayload(payload: unknown): ProgressPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as Record<string, unknown>;

  return {
    current: typeof value.current === "number" ? value.current : undefined,
    total: typeof value.total === "number" ? value.total : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    count: typeof value.count === "number" ? value.count : undefined,
    last_files:
      typeof value.last_files === "string" ? value.last_files : undefined,
    name: typeof value.name === "string" ? value.name : undefined,
  };
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

const runRefreshCycle = async (runMaintenance: boolean) => {
  const updateAssetsCount = useAssetStore.getState().updateAssetsCount;
  const refetchAssets = useAssetStore.getState().refetchAssets;

  await updateAssetsCount();
  await refetchAssets();

  if (!runMaintenance) {
    return;
  }

  try {
    const thumb = await invoke<ProcessingResponse>(
      "generate_missing_thumbnails",
    );
    console.log("thumb", thumb);
    const wav = await invoke<string>("generate_missing_waveforms");
    console.log("wav", wav);
    const vid = await invoke<ProcessingResponse>(
      "generate_missing_video_thumbnails",
    );
    console.log(vid);
  } catch (error) {
    console.error("Error generating thumbnails/waveforms:", error);
  }
};

const flushRefreshQueue = async () => {
  if (refreshInFlight) {
    refreshQueued = true;
    return;
  }

  refreshInFlight = true;

  try {
    do {
      const runMaintenance = queuedMaintenance;
      queuedMaintenance = false;
      refreshQueued = false;

      await runRefreshCycle(runMaintenance);
    } while (refreshQueued || queuedMaintenance);
  } finally {
    refreshInFlight = false;
  }
};

const scheduleFileChangeRefresh = (runMaintenance = false) => {
  queuedMaintenance = queuedMaintenance || runMaintenance;

  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void flushRefreshQueue();
  }, REFRESH_DEBOUNCE_MS);
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
      await listen("file-added", () => scheduleFileChangeRefresh(true));
      await listen("file-removed", () => scheduleFileChangeRefresh(true));
      await listen("file-renamed", () => scheduleFileChangeRefresh(true));

      await listen<ProgressPayload>("scan-progress", (event) => {
        const payload = toProgressPayload(event.payload);
        if (!payload) return;

        if (payload.status === "finished") {
          set({ countingTotal: false });
          scheduleFileChangeRefresh(true);
        }
        console.log(payload);
      });

      await listen<ProgressPayload>("waveform-progress", (event) => {
        const payload = toProgressPayload(event.payload);
        if (!payload) return;

        set({ progressSound: payload });
        if (payload.status === "done") {
          set({ progressSound: null });
          scheduleFileChangeRefresh();
        }
      });

      await listen<ProgressPayload>("thumbnail-progress", (event) => {
        const payload = toProgressPayload(event.payload);
        if (!payload) return;

        set({ progressImage: payload });
        if (payload.status === "done") {
          set({ progressImage: null });
          scheduleFileChangeRefresh();
        }
      });
    } catch (error) {
      console.error("Failed to setup event listeners:", error);
    }
  },
}));

export default useEventListenerStore;
