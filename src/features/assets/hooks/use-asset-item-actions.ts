import { useCallback } from "react";

import { deleteAssetFile } from "@/features/assets/api/folder-api";
import type { AssetType } from "@/features/assets/model/types";

type RefetchAssets = (assetType: AssetType) => Promise<void>;

type UseAssetItemActionsOptions = {
  activeAssetFilter: AssetType;
  refetchAssets: RefetchAssets;
};

export function useAssetItemActions({
  activeAssetFilter,
  refetchAssets,
}: UseAssetItemActionsOptions) {
  const refreshAssets = useCallback(async () => {
    await refetchAssets(activeAssetFilter);
  }, [activeAssetFilter, refetchAssets]);

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
