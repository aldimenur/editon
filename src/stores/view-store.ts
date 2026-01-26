import { create } from 'zustand'

interface ViewStore {
  viewModeAudio: "list" | "grid" | "large";
  viewModeVideo: "list" | "grid" | "large";
  viewModeImage: "list" | "grid" | "large";
  setViewModeAudio: (mode: "list" | "grid" | "large") => void;
  setViewModeVideo: (mode: "list" | "grid" | "large") => void;
  setViewModeImage: (mode: "list" | "grid" | "large") => void;
}

const useViewStore = create<ViewStore>()(
  (set) => ({
    viewModeAudio: "list",
    viewModeVideo: "grid",
    viewModeImage: "grid",
    setViewModeAudio: (mode: "list" | "grid" | "large") => set({ viewModeAudio: mode }),
    setViewModeVideo: (mode: "list" | "grid" | "large") => set({ viewModeVideo: mode }),
    setViewModeImage: (mode: "list" | "grid" | "large") => set({ viewModeImage: mode }),
  }),
);

export default useViewStore;