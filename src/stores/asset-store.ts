import {create} from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware';

interface AssetStore {
  sfx: number;
  video: number;
  music: number;
  image: number;
  path: string;
  setPath: (path: string) => void;
  setSfx: (count: number) => void;
  setVideo: (count: number) => void;
  setMusic: (count: number) => void;
  setImage: (count: number) => void;
}

const useAssetStore = create<AssetStore>()(
  persist(
    (set) => ({
      sfx: 0,
      video: 0,
      music: 0,
      image: 0,
      path: "",
      setPath: (path: string) => set({ path }),
      setSfx: (count: number) => set({ sfx: count }),
      setVideo: (count: number) => set({ video: count }),
      setMusic: (count: number) => set({ music: count }),
      setImage: (count: number) => set({ image: count }),
    }),
    {
      name: "asset-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useAssetStore;