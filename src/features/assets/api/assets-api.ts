import { listen } from "@tauri-apps/api/event";

import type { AssetItem } from "@/entities/asset/model/asset.types";
import { tauriInvoke } from "@/shared/api/tauri-client";

export type ScanProgress = {
  scanId: string;
  count: number;
  lastFile: string;
  status: string;
};

export type ScanRoot = {
  rootPath: string;
  dateAdded: string;
  dateLastScanned: string | null;
};

export type RootCleanupResult = {
  removedRoot: string;
  deletedAssets: number;
  deletedJobs: number;
};

export type AssetsResult = {
  data: AssetItem[];
  nextCursor: number | null;
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
};

type QueryAssetsInput = {
  cursor?: number;
  page?: number;
  limit?: number;
};

export async function queryAssets(input?: QueryAssetsInput) {
  return tauriInvoke<AssetsResult>("v2_assets_query", {
    input: {
      cursor: input?.cursor,
      page: input?.page,
      limit: input?.limit ?? 40,
      sortBy: "id",
      sortOrder: "desc",
    },
  });
}

export async function startScan(rootPath: string) {
  return tauriInvoke<string>("v2_scan_start", { rootPath });
}

export async function stopScan(scanId?: string) {
  return tauriInvoke<string>("v2_scan_stop", { scanId });
}

export async function listScanRoots() {
  return tauriInvoke<ScanRoot[]>("v2_scan_roots_list");
}

export async function syncScanRoot(rootPath: string) {
  return tauriInvoke<string>("v2_scan_sync_root", { rootPath });
}

export async function removeScanRoot(rootPath: string) {
  return tauriInvoke<RootCleanupResult>("v2_scan_root_remove", { rootPath });
}

export async function cleanupOrphanAssets() {
  return tauriInvoke<RootCleanupResult>("v2_scan_cleanup_orphans");
}

export async function onScanProgress(
  handler: (payload: ScanProgress) => void,
): Promise<() => void> {
  return listen<ScanProgress>("v2-scan-progress", (event) => {
    handler(event.payload);
  });
}
