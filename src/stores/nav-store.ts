import { create } from "zustand";

interface NavStore {
  activeItem: string | null;
  setActiveItem: (item: string) => void;
}

const useNavStore = create<NavStore>((set) => ({
  activeItem: null,
  setActiveItem: (item: string) => set({ activeItem: item }),
}));

export default useNavStore;
