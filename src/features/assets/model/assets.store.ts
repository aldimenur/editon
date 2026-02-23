import { create } from "zustand";

import {
  cleanupOrphanAssets,
  listScanRoots,
  queryAssets,
  type QueryAssetsInput,
  removeScanRoot,
  startScan,
  syncScanRoot,
  stopScan,
  type ScanRoot,
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
  scanRoots: ScanRoot[];
  syncingRootPath: string | null;
  removingRootPath: string | null;
  loading: boolean;
  error: string | null;
  setRootPath: (value: string) => void;
  setScanProgress: (value: ScanProgress | null) => void;
  setError: (value: string) => void;
  clearError: () => void;
  refresh: (targetPage?: number, filters?: QueryAssetsInput) => Promise<void>;
  refreshScanRoots: () => Promise<void>;
  beginScan: () => Promise<void>;
  syncRoot: (rootPath: string) => Promise<void>;
  removeRoot: (rootPath: string) => Promise<void>;
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
  scanRoots: [],
  syncingRootPath: null,
  removingRootPath: null,
  loading: false,
  error: null,
  setRootPath: (value) => set({ rootPath: value }),
  setScanProgress: (value) =>
    set((state) => {
      if (
        value === null ||
        value.status === "done" ||
        value.status === "cancelled" ||
        value.status === "failed"
      ) {
        return {
          scanId: null,
          scanProgress: null,
        };
      }

      return {
        scanId: value.scanId || state.scanId,
        scanProgress: value,
      };
    }),
  setError: (value) => set({ error: value }),
  clearError: () => set({ error: null }),
  refresh: async (targetPage = 1, filters) => {
    set({ loading: true });
    try {
      const result = await queryAssets({
        page: targetPage,
        limit: appConfig.pageSize,
        search: filters?.search,
        assetType: filters?.assetType,
        rootPath: filters?.rootPath,
        tags: filters?.tags,
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
  refreshScanRoots: async () => {
    try {
      await cleanupOrphanAssets();
      const roots = await listScanRoots();
      set({ scanRoots: roots, error: null });
    } catch (reason) {
      set({
        error:
          reason instanceof Error
            ? reason.message
            : "Failed to load scan roots",
      });
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
          lastFile: "Scanning...",
          status: "processing",
        },
      });
      await get().refreshScanRoots();
    } catch (reason) {
      set({
        scanId: null,
        scanProgress: null,
        error:
          reason instanceof Error ? reason.message : "Failed to start scan",
      });
    } finally {
      set({ loading: false });
    }
  },
  syncRoot: async (rootPath: string) => {
    const path = rootPath.trim();
    if (!path) {
      set({ error: "Root path is required." });
      return;
    }

    set({ syncingRootPath: path, error: null });
    try {
      const id = await syncScanRoot(path);
      set({
        scanId: id,
        scanProgress: {
          scanId: id,
          count: 0,
          lastFile: "Scanning...",
          status: "processing",
        },
      });
    } catch (reason) {
      set({
        scanId: null,
        scanProgress: null,
        error: reason instanceof Error ? reason.message : "Failed to sync root",
      });
    } finally {
      set({ syncingRootPath: null });
    }
  },
  removeRoot: async (rootPath: string) => {
    const path = rootPath.trim();
    if (!path) {
      set({ error: "Root path is required." });
      return;
    }

    set({ removingRootPath: path, error: null });
    try {
      await removeScanRoot(path);
      await get().refreshScanRoots();
      await get().refresh(1);
    } catch (reason) {
      set({
        error:
          reason instanceof Error
            ? reason.message
            : "Failed to remove scan root",
      });
    } finally {
      set({ removingRootPath: null });
    }
  },
  haltScan: async () => {
    set({ loading: true });
    try {
      await stopScan(get().scanId ?? undefined);
      set({ error: null, scanId: null, scanProgress: null });
    } catch (reason) {
      set({
        error: reason instanceof Error ? reason.message : "Failed to stop scan",
      });
    } finally {
      set({ loading: false });
    }
  },
}));
