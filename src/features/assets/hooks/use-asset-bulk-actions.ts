import { useCallback } from "react";

import { deleteAssetFile } from "@/features/assets/api/folder-api";
import type { Asset } from "@/types/tauri";

type UseAssetBulkActionsOptions = {
  selectedAssets: Asset[];
  selectedAssetIds: number[];
  commonSelectedTags: string | null;
  clearSelection: () => void;
  refreshAssets: () => Promise<void>;
  onOpenTagsDialog: (assetIds: number[], currentTags: string | null) => void;
};

export function useAssetBulkActions({
  selectedAssets,
  selectedAssetIds,
  commonSelectedTags,
  clearSelection,
  refreshAssets,
  onOpenTagsDialog,
}: UseAssetBulkActionsOptions) {
  const handleDeleteSelected = useCallback(async () => {
    if (selectedAssets.length === 0) return;

    try {
      for (const asset of selectedAssets) {
        await deleteAssetFile(asset.original_path);
      }

      clearSelection();
      await refreshAssets();
    } catch (error) {
      console.error("Failed to delete selected assets:", error);
    }
  }, [selectedAssets, clearSelection, refreshAssets]);

  const handleEditSelected = useCallback(() => {
    onOpenTagsDialog(selectedAssetIds, commonSelectedTags);
  }, [selectedAssetIds, commonSelectedTags, onOpenTagsDialog]);

  return {
    handleDeleteSelected,
    handleEditSelected,
  };
}
