import { create } from "zustand";

export type AssetFilter = "all" | "audio" | "video" | "image";
export type AppPage = "assets" | "/youtube-download" | "/settings";

interface NavStore {
  activePage: AppPage;
  setActivePage: (page: AppPage) => void;
  activeAssetFilter: AssetFilter;
  setActiveAssetFilter: (filter: AssetFilter) => void;
  isMinimized: boolean;
  setIsMinimized: (isMinimized: boolean) => void;
  toggleMinimized: () => void;
  isZenMode: boolean;
  setIsZenMode: (isZenMode: boolean) => void;
  toggleZenMode: () => void;
}

const useNavStore = create<NavStore>()((set) => ({
  activePage: "assets",
  setActivePage: (page: AppPage) => set({ activePage: page }),
  activeAssetFilter: "all",
  setActiveAssetFilter: (filter: AssetFilter) =>
    set({ activeAssetFilter: filter }),
  isMinimized: false,
  setIsMinimized: (isMinimized: boolean) => set({ isMinimized }),
  toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  isZenMode: false,
  setIsZenMode: (isZenMode: boolean) => set({ isZenMode }),
  toggleZenMode: () => set((state) => ({ isZenMode: !state.isZenMode })),
}));

export default useNavStore;
