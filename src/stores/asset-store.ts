import { countAssets } from '@/lib/utils';
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { Asset } from '@/types/tauri';

interface AssetStore {
  // Counts
  sfx: number;
  video: number;
  music: number;
  image: number;

  parentPath: string;

  // Search queries
  sfxSearch: string;
  videoSearch: string;
  imageSearch: string;

  // Asset data
  sfxFiles: Asset[];
  videoFiles: Asset[];
  imageFiles: Asset[];

  // Pagination
  sfxSearchCount: number;
  videoSearchCount: number;
  imageSearchCount: number;

  // Loading state
  isLoading: boolean;

  // Setters for paths
  setParentPath: (path: string) => void;

  // Setters for search
  setSfxSearch: (search: string) => void;
  setVideoSearch: (search: string) => void;
  setImageSearch: (search: string) => void;

  // Asset data operations
  setSfxFiles: (files: Asset[], reset?: boolean) => void;
  setVideoFiles: (files: Asset[], reset?: boolean) => void;
  setImageFiles: (files: Asset[], reset?: boolean) => void;

  setSfxSearchCount: (count: number) => void;
  setVideoSearchCount: (count: number) => void;
  setImageSearchCount: (count: number) => void;

  setIsLoading: (loading: boolean) => void;

  // Async operations
  updateAssetsCount: () => void;
  fetchSfxAssets: (page: number, pageSize: number, reset?: boolean) => Promise<void>;
  fetchVideoAssets: (page: number, pageSize: number, reset?: boolean) => Promise<void>;
  fetchImageAssets: (page: number, pageSize: number, reset?: boolean) => Promise<void>;
}

const useAssetStore = create<AssetStore>()(
  persist(
    (set, get) => ({
      // Initial counts
      sfx: 0,
      video: 0,
      music: 0,
      image: 0,

      // Initial paths
      parentPath: "",
      sfxPath: "",
      videoPath: "",
      musicPath: "",
      imagePath: "",

      // Initial search queries
      sfxSearch: "",
      videoSearch: "",
      musicSearch: "",
      imageSearch: "",

      // Initial asset files
      sfxFiles: [],
      videoFiles: [],
      musicFiles: [],
      imageFiles: [],

      // Initial search counts
      sfxSearchCount: 0,
      videoSearchCount: 0,
      musicSearchCount: 0,
      imageSearchCount: 0,

      // Initial loading state
      isLoading: false,

      // Search setters
      setSfxSearch: (search: string) => set({ sfxSearch: search }),
      setVideoSearch: (search: string) => set({ videoSearch: search }),
      setImageSearch: (search: string) => set({ imageSearch: search }),

      // File setters
      setSfxFiles: (files: Asset[], reset: boolean = false) =>
        set((state) => ({
          sfxFiles: reset ? files : [...state.sfxFiles, ...files],
        })),
      setVideoFiles: (files: Asset[], reset: boolean = false) =>
        set((state) => ({
          videoFiles: reset ? files : [...state.videoFiles, ...files],
        })),
      setImageFiles: (files: Asset[], reset: boolean = false) =>
        set((state) => ({
          imageFiles: reset ? files : [...state.imageFiles, ...files],
        })),

      // Search count setters
      setSfxSearchCount: (count: number) => set({ sfxSearchCount: count }),
      setVideoSearchCount: (count: number) => set({ videoSearchCount: count }),
      setImageSearchCount: (count: number) => set({ imageSearchCount: count }),

      // Loading state setter
      setIsLoading: (loading: boolean) => set({ isLoading: loading }),

      // Update asset counts
      updateAssetsCount: async () => {
        const audioCount = await countAssets.audio()
        const videoCount = await countAssets.video()
        const imageCount = await countAssets.image()
        set({ sfx: audioCount })
        set({ video: videoCount })
        set({ image: imageCount })
      },

      // Path setters
      setParentPath: async (path: string) => {
        set({ parentPath: path })
        await invoke("cancel_scan");
        await invoke('clear_db');
        await invoke("scan_and_import_folder", {
          folderPath: path,
        });
      },

      // Fetch SFX assets with pagination
      fetchSfxAssets: async (page: number, pageSize: number, reset: boolean = false) => {
        const state = get();
        if (!state.parentPath) return;

        try {
          set({ isLoading: true });
          const result = await invoke("get_assets_paginated", {
            page,
            pageSize,
            query: state.sfxSearch || "",
            assetType: "audio",
          }) as any;

          const assets = result.data || [];
          state.setSfxFiles(assets, reset);
          set({ sfxSearchCount: result.total_items ?? 0 });

        } catch (error) {
          console.error("Error fetching SFX assets:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      // Fetch Video assets with pagination
      fetchVideoAssets: async (page: number, pageSize: number, reset: boolean = false) => {
        const state = get();
        if (!state.parentPath) return;

        try {
          set({ isLoading: true });
          const result = await invoke("get_assets_paginated", {
            page,
            pageSize,
            query: state.videoSearch || "",
            assetType: "video",
          }) as any;

          const assets = result.data || [];
          state.setVideoFiles(assets, reset);
          set({ videoSearchCount: result.total_items ?? 0 });

        } catch (error) {
          console.error("Error fetching Video assets:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      // Fetch Image assets with pagination
      fetchImageAssets: async (page: number, pageSize: number, reset: boolean = false) => {
        const state = get();
        if (!state.parentPath) return;

        try {
          set({ isLoading: true });
          const result = await invoke("get_assets_paginated", {
            page,
            pageSize,
            query: state.imageSearch || "",
            assetType: "image",
          }) as any;

          const assets = result.data || [];
          state.setImageFiles(assets, reset);
          set({ imageSearchCount: result.total_items ?? 0 });

        } catch (error) {
          console.error("Error fetching Image assets:", error);
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: "asset-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useAssetStore;