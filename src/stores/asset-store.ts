import { getAssetsPaginated } from "@/features/assets/api/assets-api";
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
  parentPath: string;

  // Search queries
  globalSearch: AssetSearchState;

  // Asset data
  globalFiles: Asset[];

  // Pagination
  globalSearchCount: number;

  // Loading state
  isLoading: boolean;

  // Setters for paths
  setParentPath: (path: string) => void;

  // Setters for search
  setGlobalSearch: (search: string, tags?: string[]) => void;

  // Asset data operations
  setGlobalFiles: (files: Asset[], reset?: boolean) => void;
  mergeGlobalFiles: (files: Asset[], totalCount?: number) => void;

  setGlobalSearchCount: (count: number) => void;

  // Async operations
  fetchGlobalAssets: (
    page: number,
    pageSize: number,
    assetType: AssetType,
    reset?: boolean,
  ) => Promise<void>;
  refetchAssets: (
    assetType: AssetType,
    page?: number,
    pageSize?: number,
  ) => Promise<void>;
}

function getAssetKey(asset: Asset): string {
  if (typeof asset.id === "number") {
    return `id:${asset.id}`;
  }

  return `path:${asset.original_path}`;
}

const useAssetStore = create<AssetStore>()(
  persist(
    (set, get) => {
      const inFlightRequestKeys = new Set<string>();
      let activeFetchCount = 0;

      const fetchAssetsWithSearch = async (
        page: number,
        pageSize: number,
        assetType: AssetType,
        searchState: AssetSearchState,
        setFiles: (
          files: Asset[],
          reset?: boolean,
          totalCount?: number,
        ) => void,
        setCount: (count: number) => void,
        errorLabel: string,
        reset: boolean = false,
      ) => {
        const state = get();
        if (!state.parentPath) return;

        const { tags, sortBy, sortOrder } = searchState;
        const search = searchState.search.trim();
        const requestKey = JSON.stringify({
          parentPath: state.parentPath,
          page,
          pageSize,
          assetType,
          search,
          tags,
          sortBy,
          sortOrder,
          reset,
        });

        if (inFlightRequestKeys.has(requestKey)) {
          return;
        }

        inFlightRequestKeys.add(requestKey);
        activeFetchCount += 1;
        set({ isLoading: true });

        try {
          const result = await getAssetsPaginated(page, pageSize, assetType, {
            search,
            tags,
            sortBy,
            sortOrder,
          });

          const assets = result.data || [];
          const totalCount = result.total_items ?? 0;
          setCount(totalCount);
          setFiles(assets, reset, totalCount);
        } catch (error) {
          console.error(`Error fetching ${errorLabel}:`, error);
        } finally {
          inFlightRequestKeys.delete(requestKey);
          activeFetchCount = Math.max(0, activeFetchCount - 1);
          set({ isLoading: activeFetchCount > 0 });
        }
      };

      return {
        // Initial paths
        parentPath: "",

        // Initial search queries
        globalSearch: createDefaultSearchState(),

        // Initial asset files
        globalFiles: [],

        // Initial search counts
        globalSearchCount: 0,

        // Initial loading state
        isLoading: false,

        // Search setters
        setGlobalSearch: (search: string, tags: string[] = []) =>
          set({
            globalSearch: {
              ...createDefaultSearchState(),
              search,
              tags,
            },
          }),

        // File setters
        setGlobalFiles: (files: Asset[], reset: boolean = false) =>
          set((state) => {
            if (reset) {
              return { globalFiles: files };
            }

            const existingKeys = new Set(
              state.globalFiles.map((asset) => getAssetKey(asset)),
            );
            const incomingUnique = files.filter((asset) => {
              const assetKey = getAssetKey(asset);
              if (existingKeys.has(assetKey)) {
                return false;
              }

              existingKeys.add(assetKey);
              return true;
            });

            return {
              globalFiles: [...state.globalFiles, ...incomingUnique],
            };
          }),

        mergeGlobalFiles: (files: Asset[], totalCount?: number) =>
          set((state) => {
            if (files.length === 0) {
              return { globalFiles: [] };
            }

            const incomingKeys = new Set(
              files.map((asset) => getAssetKey(asset)),
            );
            const preservedExisting = state.globalFiles.filter(
              (asset) => !incomingKeys.has(getAssetKey(asset)),
            );

            const mergedFiles = [...files, ...preservedExisting];
            if (typeof totalCount !== "number") {
              return { globalFiles: mergedFiles };
            }

            return {
              globalFiles: mergedFiles.slice(0, Math.max(0, totalCount)),
            };
          }),

        // Search count setters
        setGlobalSearchCount: (count: number) =>
          set({ globalSearchCount: count }),

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

        // Refetch current global assets using active type
        refetchAssets: async (
          assetType: AssetType,
          page: number = 1,
          pageSize: number = 50,
        ) => {
          const state = get();
          if (!state.parentPath) return;

          if (page !== 1) {
            await state.fetchGlobalAssets(page, pageSize, assetType);
            return;
          }

          await fetchAssetsWithSearch(
            page,
            pageSize,
            assetType,
            state.globalSearch,
            (files, _reset, totalCount) => {
              state.mergeGlobalFiles(files, totalCount);
            },
            state.setGlobalSearchCount,
            "global assets",
          );
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
