import { create } from "zustand";

interface NavStore {
  activeItem: string;
  setActiveItem: (item: string) => void;
  isMinimized: boolean;
  setIsMinimized: (isMinimized: boolean) => void;
  toggleMinimized: () => void;
  isZenMode: boolean;
  setIsZenMode: (isZenMode: boolean) => void;
  toggleZenMode: () => void;
}

const useNavStore = create<NavStore>()((set) => ({
  activeItem: "/sound",
  setActiveItem: (item: string) => set({ activeItem: item }),
  isMinimized: false,
  setIsMinimized: (isMinimized: boolean) => set({ isMinimized }),
  toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  isZenMode: false,
  setIsZenMode: (isZenMode: boolean) => set({ isZenMode }),
  toggleZenMode: () => set((state) => ({ isZenMode: !state.isZenMode })),
}));

export default useNavStore;
