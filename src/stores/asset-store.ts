import {create} from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware';

interface AssetStore {
    sfx: number;
    video: number;
    music: number;
    setSfx: (count: number) => void;
    setVideo: (count: number) => void;
    setMusic: (count: number) => void;
}

const useAssetStore = create<AssetStore>()(persist((set) => ({
    sfx: 0,
    video: 0,
    music: 0,
    setSfx: (count: number) => set({ sfx: count }),
    setVideo: (count: number) => set({ video: count }),
    setMusic: (count: number) => set({ music: count }),
}), {
    name: "asset-store",
    storage: createJSONStorage(() => localStorage),
}));

export default useAssetStore;