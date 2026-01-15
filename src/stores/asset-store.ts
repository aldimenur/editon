import {create} from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware';

interface AssetStore {
  sfx: number;
  video: number;
  music: number;
  image: number;
  sfxPath: string;
  videoPath: string;
  musicPath: string;
  imagePath: string;
  sfxSearch: string;
  videoSearch: string;
  musicSearch: string;
  imageSearch: string;
  setSfxPath: (path: string) => void;
  setVideoPath: (path: string) => void;
  setMusicPath: (path: string) => void;
  setImagePath: (path: string) => void;
  setSfxSearch: (search: string) => void;
  setVideoSearch: (search: string) => void;
  setMusicSearch: (search: string) => void;
  setImageSearch: (search: string) => void;
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
      sfxPath: "",
      videoPath: "",
      musicPath: "",
      imagePath: "",
      sfxSearch: "",
      videoSearch: "",
      musicSearch: "",
      imageSearch: "",
      setSfxPath: (path: string) => set({ sfxPath: path }),
      setVideoPath: (path: string) => set({ videoPath: path }),
      setMusicPath: (path: string) => set({ musicPath: path }),
      setImagePath: (path: string) => set({ imagePath: path }),
      setSfxSearch: (search: string) => set({ sfxSearch: search }),
      setVideoSearch: (search: string) => set({ videoSearch: search }),
      setMusicSearch: (search: string) => set({ musicSearch: search }),
      setImageSearch: (search: string) => set({ imageSearch: search }),
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