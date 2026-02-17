import { countAssets } from "@/lib/utils";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type { Asset, AssetQueryParams, PaginatedResponse } from "@/types/tauri";

type AssetSearchState = {
  search: string;
  tags: string[];
  sortBy: NonNullable<AssetQueryParams["sortBy"]>;
  sortOrder: NonNullable<AssetQueryParams["sortOrder"]>;
};

function createDefaultSearchState(): AssetSearchState {
  return {
    search: "",
    tags: [],
    sortBy: "date_modified",
    sortOrder: "desc",
  };
}

async function getAssetsPaginated(
  page: number,
  pageSize: number,
  assetType: "audio" | "video" | "image",
  queryParams: AssetQueryParams,
): Promise<PaginatedResponse> {
  return invoke<PaginatedResponse>("get_assets_paginated", {
    page,
    pageSize,
    queryParams: {
      ...queryParams,
      assetType,
    },
  });
}

interface AssetStore {
  // Counts
  sfx: number;
  video: number;
  image: number;

  parentPath: string;

  // Search queries
  sfxSearch: AssetSearchState;
  videoSearch: AssetSearchState;
  imageSearch: AssetSearchState;

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
  setSfxSearch: (search: string, tags?: string[]) => void;
  setVideoSearch: (search: string, tags?: string[]) => void;
  setImageSearch: (search: string, tags?: string[]) => void;

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
  fetchSfxAssets: (
    page: number,
    pageSize: number,
    reset?: boolean,
  ) => Promise<void>;
  fetchVideoAssets: (
    page: number,
    pageSize: number,
    reset?: boolean,
  ) => Promise<void>;
  fetchImageAssets: (
    page: number,
    pageSize: number,
    reset?: boolean,
  ) => Promise<void>;
  refetchAssets: (page?: number, pageSize?: number) => Promise<void>;
}

const useAssetStore = create<AssetStore>()(
  persist(
    (set, get) => ({
      // Initial counts
      sfx: 0,
      video: 0,
      image: 0,

      // Initial paths
      parentPath: "",
      sfxPath: "",
      videoPath: "",
      imagePath: "",

      // Initial search queries
      sfxSearch: createDefaultSearchState(),
      videoSearch: createDefaultSearchState(),
      imageSearch: createDefaultSearchState(),

      // Initial asset files
      sfxFiles: [],
      videoFiles: [],
      imageFiles: [],

      // Initial search counts
      sfxSearchCount: 0,
      videoSearchCount: 0,
      imageSearchCount: 0,

      // Initial loading state
      isLoading: false,

      // Search setters
      setSfxSearch: (search: string, tags: string[] = []) =>
        set({
          sfxSearch: {
            ...createDefaultSearchState(),
            search,
            tags,
          },
        }),
      setVideoSearch: (search: string, tags: string[] = []) =>
        set({
          videoSearch: {
            ...createDefaultSearchState(),
            search,
            tags,
          },
        }),
      setImageSearch: (search: string, tags: string[] = []) =>
        set({
          imageSearch: {
            ...createDefaultSearchState(),
            search,
            tags,
          },
        }),

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
        const assets = await countAssets();
        set({ sfx: assets.audio, video: assets.video, image: assets.image });
        return assets;
      },

      // Path setters
      setParentPath: async (path: string) => {
        set({ parentPath: path });
        await invoke("cancel_scan");
        await invoke("clear_db");

        await invoke("scan_and_import_folder", {
          folderPath: path,
        });
      },

      // Fetch SFX assets with pagination
      fetchSfxAssets: async (
        page: number,
        pageSize: number,
        reset: boolean = false,
      ) => {
        const state = get();
        if (!state.parentPath) return;

        try {
          set({ isLoading: true });
          const { tags, sortBy, sortOrder } = state.sfxSearch;
          const search = state.sfxSearch.search.trim();

          const result = await getAssetsPaginated(page, pageSize, "audio", {
            search,
            tags,
            sortBy,
            sortOrder,
          });

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
      fetchVideoAssets: async (
        page: number,
        pageSize: number,
        reset: boolean = false,
      ) => {
        const state = get();
        if (!state.parentPath) return;

        try {
          set({ isLoading: true });
          const { tags, sortBy, sortOrder } = state.videoSearch;
          const search = state.videoSearch.search.trim();

          const result = await getAssetsPaginated(page, pageSize, "video", {
            search,
            tags,
            sortBy,
            sortOrder,
          });

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
      fetchImageAssets: async (
        page: number,
        pageSize: number,
        reset: boolean = false,
      ) => {
        const state = get();
        if (!state.parentPath) return;

        try {
          set({ isLoading: true });
          const { tags, sortBy, sortOrder } = state.imageSearch;
          const search = state.imageSearch.search.trim();

          const result = await getAssetsPaginated(page, pageSize, "image", {
            search,
            tags,
            sortBy,
            sortOrder,
          });

          const assets = result.data || [];
          state.setImageFiles(assets, reset);
          set({ imageSearchCount: result.total_items ?? 0 });
        } catch (error) {
          console.error("Error fetching Image assets:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      // Refetch all asset types (audio, video, image) in a single trigger
      refetchAssets: async (page: number = 1, pageSize: number = 50) => {
        const state = get();
        if (!state.parentPath) return;

        try {
          set({ isLoading: true });

          // Reset current lists
          state.setSfxFiles([], true);
          state.setVideoFiles([], true);
          state.setImageFiles([], true);

          // Fetch each type (sequentially to avoid overloading the backend)
          await state.fetchSfxAssets(page, pageSize, true);
          await state.fetchVideoAssets(page, pageSize, true);
          await state.fetchImageAssets(page, pageSize, true);
        } catch (error) {
          console.error("Error refetching assets:", error);
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
