import { create } from "zustand";

interface ViewStore {
  viewModeAssets: "list" | "grid" | "large";
  viewModeAudio: "list" | "grid" | "large";
  viewModeVideo: "list" | "grid" | "large";
  viewModeImage: "list" | "grid" | "large";
  setViewModeAssets: (mode: "list" | "grid" | "large") => void;
  setViewModeAudio: (mode: "list" | "grid" | "large") => void;
  setViewModeVideo: (mode: "list" | "grid" | "large") => void;
  setViewModeImage: (mode: "list" | "grid" | "large") => void;
}

const useViewStore = create<ViewStore>()((set) => ({
  viewModeAssets: "grid",
  viewModeAudio: "list",
  viewModeVideo: "grid",
  viewModeImage: "grid",
  setViewModeAssets: (mode: "list" | "grid" | "large") =>
    set({ viewModeAssets: mode }),
  setViewModeAudio: (mode: "list" | "grid" | "large") =>
    set({ viewModeAudio: mode }),
  setViewModeVideo: (mode: "list" | "grid" | "large") =>
    set({ viewModeVideo: mode }),
  setViewModeImage: (mode: "list" | "grid" | "large") =>
    set({ viewModeImage: mode }),
}));

export default useViewStore;
