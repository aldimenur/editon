import {create} from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware';

interface ViewStore {
  viewModeAudio: "list" | "grid" | "large";
  viewModeVideo: "list" | "grid" | "large";
  viewModeImage: "list" | "grid" | "large";
  setViewModeAudio: (mode: "list" | "grid" | "large") => void;
  setViewModeVideo: (mode: "list" | "grid" | "large") => void;
  setViewModeImage: (mode: "list" | "grid" | "large") => void;
}

const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      viewModeAudio: "list",
      viewModeVideo: "list",
      viewModeImage: "list",
      setViewModeAudio: (mode: "list" | "grid" | "large") => set({ viewModeAudio: mode }),
      setViewModeVideo: (mode: "list" | "grid" | "large") => set({ viewModeVideo: mode }),
      setViewModeImage: (mode: "list" | "grid" | "large") => set({ viewModeImage: mode }),
    }),
    {
      name: "view-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useViewStore;