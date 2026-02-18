import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback } from "react";

import type { Asset } from "@/types/tauri";

type UseAssetContextMenuOptions = {
  selectedAssetIds: number[];
  toggleSelection: (assetId: number) => void;
  onEditTags: (assetId: number, currentTags: string | null) => void;
  onDeleteAsset: (path: string) => Promise<void> | void;
};

export function useAssetContextMenu({
  selectedAssetIds,
  toggleSelection,
  onEditTags,
  onDeleteAsset,
}: UseAssetContextMenuOptions) {
  const appWindow = getCurrentWindow();

  const openContextMenu = useCallback(
    async (file: Asset, x: number, y: number) => {
      const fileId = file.id;
      if (typeof fileId !== "number") return;

      const isSelected = selectedAssetIds.includes(fileId);

      const menu = await Menu.new({
        items: [
          {
            text: isSelected ? "Deselect" : "Select",
            accelerator: "S",
            action: () => toggleSelection(fileId),
          },
          {
            text: "Edit tags",
            accelerator: "T",
            action: () => onEditTags(fileId, file.tags ?? null),
          },
          {
            text: "Show in folder",
            accelerator: "O",
            action: () => {
              void revealItemInDir(file.original_path);
            },
          },
          { item: "Separator" },
          {
            text: "Delete",
            accelerator: "Delete",
            action: () => {
              void onDeleteAsset(file.original_path);
            },
          },
        ],
      });

      try {
        await menu.popup(new LogicalPosition(x, y), appWindow);
      } finally {
        await menu.close();
      }
    },
    [appWindow, onDeleteAsset, onEditTags, selectedAssetIds, toggleSelection],
  );

  return {
    openContextMenu,
  };
}
