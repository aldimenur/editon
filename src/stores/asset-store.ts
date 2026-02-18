import {
  countAssets,
  getAssetsPaginated,
} from "@/features/assets/api/assets-api";
import {
  cancelScan,
  clearAssetDb,
  scanAndImportFolder,
} from "@/features/assets/api/folder-api";
import type { AssetType } from "@/features/assets/model/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Asset, AssetQueryParams } from "@/types/tauri";

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
  globalSearch: AssetSearchState;

  // Asset data
  sfxFiles: Asset[];
  videoFiles: Asset[];
  imageFiles: Asset[];
  globalFiles: Asset[];

  // Pagination
  sfxSearchCount: number;
  videoSearchCount: number;
  imageSearchCount: number;
  globalSearchCount: number;

  // Loading state
  isLoading: boolean;

  // Setters for paths
  setParentPath: (path: string) => void;

  // Setters for search
  setSfxSearch: (search: string, tags?: string[]) => void;
  setVideoSearch: (search: string, tags?: string[]) => void;
  setImageSearch: (search: string, tags?: string[]) => void;
  setGlobalSearch: (search: string, tags?: string[]) => void;

  // Asset data operations
  setSfxFiles: (files: Asset[], reset?: boolean) => void;
  setVideoFiles: (files: Asset[], reset?: boolean) => void;
  setImageFiles: (files: Asset[], reset?: boolean) => void;
  setGlobalFiles: (files: Asset[], reset?: boolean) => void;

  setSfxSearchCount: (count: number) => void;
  setVideoSearchCount: (count: number) => void;
  setImageSearchCount: (count: number) => void;
  setGlobalSearchCount: (count: number) => void;

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
  fetchGlobalAssets: (
    page: number,
    pageSize: number,
    assetType: AssetType,
    reset?: boolean,
  ) => Promise<void>;
  refetchAssets: (page?: number, pageSize?: number) => Promise<void>;
}

const useAssetStore = create<AssetStore>()(
  persist(
    (set, get) => {
      const fetchAssetsWithSearch = async (
        page: number,
        pageSize: number,
        assetType: AssetType,
        searchState: AssetSearchState,
        setFiles: (files: Asset[], reset?: boolean) => void,
        setCount: (count: number) => void,
        errorLabel: string,
        reset: boolean = false,
      ) => {
        const state = get();
        if (!state.parentPath) return;

        try {
          set({ isLoading: true });
          const { tags, sortBy, sortOrder } = searchState;
          const search = searchState.search.trim();

          const result = await getAssetsPaginated(page, pageSize, assetType, {
            search,
            tags,
            sortBy,
            sortOrder,
          });

          const assets = result.data || [];
          setFiles(assets, reset);
          setCount(result.total_items ?? 0);
        } catch (error) {
          console.error(`Error fetching ${errorLabel}:`, error);
        } finally {
          set({ isLoading: false });
        }
      };

      return {
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
        globalSearch: createDefaultSearchState(),

        // Initial asset files
        sfxFiles: [],
        videoFiles: [],
        imageFiles: [],
        globalFiles: [],

        // Initial search counts
        sfxSearchCount: 0,
        videoSearchCount: 0,
        imageSearchCount: 0,
        globalSearchCount: 0,

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
        setGlobalSearch: (search: string, tags: string[] = []) =>
          set({
            globalSearch: {
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
        setGlobalFiles: (files: Asset[], reset: boolean = false) =>
          set((state) => ({
            globalFiles: reset ? files : [...state.globalFiles, ...files],
          })),

        // Search count setters
        setSfxSearchCount: (count: number) => set({ sfxSearchCount: count }),
        setVideoSearchCount: (count: number) =>
          set({ videoSearchCount: count }),
        setImageSearchCount: (count: number) =>
          set({ imageSearchCount: count }),
        setGlobalSearchCount: (count: number) =>
          set({ globalSearchCount: count }),

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
          try {
            await cancelScan();
            await clearAssetDb();
            await scanAndImportFolder(path);
          } catch (error) {
            console.error("Failed to set parent path:", error);
          }
        },

        // Fetch SFX assets with pagination
        fetchSfxAssets: async (
          page: number,
          pageSize: number,
          reset: boolean = false,
        ) => {
          const state = get();
          await fetchAssetsWithSearch(
            page,
            pageSize,
            "audio",
            state.sfxSearch,
            state.setSfxFiles,
            state.setSfxSearchCount,
            "SFX assets",
            reset,
          );
        },

        // Fetch Video assets with pagination
        fetchVideoAssets: async (
          page: number,
          pageSize: number,
          reset: boolean = false,
        ) => {
          const state = get();
          await fetchAssetsWithSearch(
            page,
            pageSize,
            "video",
            state.videoSearch,
            state.setVideoFiles,
            state.setVideoSearchCount,
            "Video assets",
            reset,
          );
        },

        // Fetch Image assets with pagination
        fetchImageAssets: async (
          page: number,
          pageSize: number,
          reset: boolean = false,
        ) => {
          const state = get();
          await fetchAssetsWithSearch(
            page,
            pageSize,
            "image",
            state.imageSearch,
            state.setImageFiles,
            state.setImageSearchCount,
            "Image assets",
            reset,
          );
        },

        fetchGlobalAssets: async (
          page: number,
          pageSize: number,
          assetType: AssetType,
          reset: boolean = false,
        ) => {
          const state = get();
          await fetchAssetsWithSearch(
            page,
            pageSize,
            assetType,
            state.globalSearch,
            state.setGlobalFiles,
            state.setGlobalSearchCount,
            "global assets",
            reset,
          );
        },

        // Refetch all asset types (audio, video, image) in a single trigger
        refetchAssets: async (page: number = 1, pageSize: number = 50) => {
          const state = get();
          if (!state.parentPath) return;

          // Reset current lists
          state.setSfxFiles([], true);
          state.setVideoFiles([], true);
          state.setImageFiles([], true);

          // Fetch each type (sequentially to avoid overloading the backend)
          await state.fetchSfxAssets(page, pageSize, true);
          await state.fetchVideoAssets(page, pageSize, true);
          await state.fetchImageAssets(page, pageSize, true);
        },
      };
    },
    {
      name: "asset-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useAssetStore;
