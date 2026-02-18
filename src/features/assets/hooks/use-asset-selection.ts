import { useCallback, useMemo, useState } from "react";

import type { Asset } from "@/types/tauri";

export function useAssetSelection(globalFiles: Asset[]) {
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);

  const filteredAssetIds = useMemo(
    () =>
      globalFiles
        .map((file) => file.id)
        .filter((id): id is number => typeof id === "number"),
    [globalFiles],
  );

  const allFilteredSelected = useMemo(
    () =>
      filteredAssetIds.length > 0 &&
      filteredAssetIds.every((id) => selectedAssetIds.includes(id)),
    [filteredAssetIds, selectedAssetIds],
  );

  const selectedAssets = useMemo(
    () =>
      globalFiles.filter((asset) =>
        typeof asset.id === "number"
          ? selectedAssetIds.includes(asset.id)
          : false,
      ),
    [globalFiles, selectedAssetIds],
  );

  const selectAllFiltered = useCallback(() => {
    setSelectedAssetIds(filteredAssetIds);
  }, [filteredAssetIds]);

  const toggleSelection = useCallback((assetId: number) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId],
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedAssetIds([]);
  }, []);

  return {
    selectedAssetIds,
    filteredAssetIds,
    allFilteredSelected,
    selectedAssets,
    selectAllFiltered,
    toggleSelection,
    clearSelection,
  };
}
