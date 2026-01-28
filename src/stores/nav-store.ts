import { create } from "zustand";

interface NavStore {
  activeItem: string;
  setActiveItem: (item: string) => void;
  isMinimized: boolean;
  setIsMinimized: (isMinimized: boolean) => void;
  toggleMinimized: () => void;
}

const useNavStore = create<NavStore>()(
  (set) => ({
    activeItem: "/sound",
    setActiveItem: (item: string) => set({ activeItem: item }),
    isMinimized: false,
    setIsMinimized: (isMinimized: boolean) => set({ isMinimized }),
    toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  }),
);

export default useNavStore;
