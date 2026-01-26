import { create } from "zustand";

interface NavStore {
  activeItem: string;
  setActiveItem: (item: string) => void;
}

const useNavStore = create<NavStore>()(
  (set) => ({
    activeItem: "/sound",
    setActiveItem: (item: string) => set({ activeItem: item }),
  }),
);

export default useNavStore;
