import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface NavStore {
  activeItem: string;
  setActiveItem: (item: string) => void;
}

const useNavStore = create<NavStore>()(
  persist(
    (set) => ({
      activeItem: "/sound",
      setActiveItem: (item: string) => set({ activeItem: item }),
    }),
    {
      name: "nav-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useNavStore;
