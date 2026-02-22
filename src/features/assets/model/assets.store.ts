import { create } from "zustand";

import {
  queryAssets,
  startScan,
  stopScan,
  type ScanProgress,
} from "@/features/assets/api/assets-api";
import { appConfig } from "@/shared/config/app-config";

type AssetsStore = {
  items: Array<{
    id: number;
    filename: string;
    extension: string;
    originalPath: string;
    typeName: string;
    thumbnailPath: string | null;
    fileSize: number;
    mtimeMs: number;
    tags: string[];
    waveformData: number[] | null;
    dateModified: string;
  }>;
  page: number;
  totalPages: number;
  totalItems: number;
  rootPath: string;
  scanId: string | null;
  scanProgress: ScanProgress | null;
  loading: boolean;
  error: string | null;
  setRootPath: (value: string) => void;
  setScanProgress: (value: ScanProgress) => void;
  setError: (value: string) => void;
  clearError: () => void;
  refresh: (targetPage?: number) => Promise<void>;
  beginScan: () => Promise<void>;
  haltScan: () => Promise<void>;
};

export const useAssetsStore = create<AssetsStore>((set, get) => ({
  items: [],
  page: 1,
  totalPages: 1,
  totalItems: 0,
  rootPath: "F:/",
  scanId: null,
  scanProgress: null,
  loading: false,
  error: null,
  setRootPath: (value) => set({ rootPath: value }),
  setScanProgress: (value) => set({ scanProgress: value }),
  setError: (value) => set({ error: value }),
  clearError: () => set({ error: null }),
  refresh: async (targetPage = 1) => {
    set({ loading: true });
    try {
      const result = await queryAssets({
        page: targetPage,
        limit: appConfig.pageSize,
      });
      set({
        items: result.data,
        page: result.currentPage,
        totalPages: result.totalPages,
        totalItems: result.totalItems,
        error: null,
      });
    } catch (reason) {
      set({
        error:
          reason instanceof Error ? reason.message : "Failed to load assets",
      });
    } finally {
      set({ loading: false });
    }
  },
  beginScan: async () => {
    const rootPath = get().rootPath.trim();

    if (!rootPath) {
      set({ error: "Root path is required." });
      return;
    }

    set({ loading: true });
    try {
      const id = await startScan(rootPath);
      set({
        scanId: id,
        error: null,
        scanProgress: {
          scanId: id,
          count: 0,
          lastFile: "",
          status: "processing",
        },
      });
    } catch (reason) {
      set({
        error:
          reason instanceof Error ? reason.message : "Failed to start scan",
      });
    } finally {
      set({ loading: false });
    }
  },
  haltScan: async () => {
    set({ loading: true });
    try {
      await stopScan(get().scanId ?? undefined);
      set({ error: null });
    } catch (reason) {
      set({
        error: reason instanceof Error ? reason.message : "Failed to stop scan",
      });
    } finally {
      set({ loading: false });
    }
  },
}));
