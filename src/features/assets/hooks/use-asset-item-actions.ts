import { useCallback } from "react";

import { deleteAssetFile } from "@/features/assets/api/folder-api";
import { ASSETS_PAGE_SIZE } from "@/features/assets/constants";
import type { AssetType } from "@/features/assets/model/types";

type FetchGlobalAssets = (
  page: number,
  pageSize: number,
  assetType: AssetType,
  reset?: boolean,
) => Promise<void>;

type UseAssetItemActionsOptions = {
  activeAssetFilter: AssetType;
  fetchGlobalAssets: FetchGlobalAssets;
};

export function useAssetItemActions({
  activeAssetFilter,
  fetchGlobalAssets,
}: UseAssetItemActionsOptions) {
  const refreshAssets = useCallback(async () => {
    await fetchGlobalAssets(1, ASSETS_PAGE_SIZE, activeAssetFilter, true);
  }, [activeAssetFilter, fetchGlobalAssets]);

  const handleDeleteAsset = useCallback(
    async (path: string) => {
      try {
        await deleteAssetFile(path);
        await refreshAssets();
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    },
    [refreshAssets],
  );

  const handleDeleteTrimmed = useCallback(async (path: string) => {
    try {
      await deleteAssetFile(path);
    } catch (error) {
      console.error("Failed to delete trimmed file:", error);
    }
  }, []);

  const handleTrimApplied = useCallback(
    async (_outputPath: string) => {
      await refreshAssets();
    },
    [refreshAssets],
  );

  return {
    refreshAssets,
    handleDeleteAsset,
    handleDeleteTrimmed,
    handleTrimApplied,
  };
}
