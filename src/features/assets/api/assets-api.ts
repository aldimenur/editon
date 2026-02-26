import { listen } from "@tauri-apps/api/event";

import type { AssetItem } from "@/entities/asset/model/asset.types";
import { tauriInvoke } from "@/shared/api/tauri-client";

export type ScanProgress = {
  scanId: string;
  count: number;
  lastFile: string;
  status: string;
};

type ScanProgressEventPayload = {
  scanId?: string;
  scan_id?: string;
  count?: number | string;
  lastFile?: string;
  last_file?: string;
  status?: string;
};

function normalizeCount(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeScanProgress(
  payload: ScanProgressEventPayload,
): ScanProgress {
  return {
    scanId: payload.scanId ?? payload.scan_id ?? "",
    count: normalizeCount(payload.count),
    lastFile: payload.lastFile ?? payload.last_file ?? "",
    status: payload.status ?? "processing",
  };
}

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

export type QueryAssetsInput = {
  cursor?: number;
  page?: number;
  limit?: number;
  search?: string;
  assetType?: string;
  rootPath?: string;
  tags?: string[];
};

export type AssetMutationInput = {
  action: "rename" | "delete" | "set_tags";
  assetId?: number;
  path?: string;
  newName?: string;
  tags?: string[];
};

export async function queryAssets(input?: QueryAssetsInput) {
  const rootPath = input?.rootPath?.trim();
  return tauriInvoke<AssetsResult>("v2_assets_query", {
    input: {
      cursor: input?.cursor,
      page: input?.page,
      limit: input?.limit ?? 40,
      search: input?.search?.trim() || undefined,
      assetType: input?.assetType,
      rootPath: rootPath && rootPath.length > 0 ? rootPath : undefined,
      tags: input?.tags,
      sortBy: "id",
      sortOrder: "desc",
    },
  });
}

export async function mutateAsset(input: AssetMutationInput) {
  return tauriInvoke<string>("v2_asset_mutation", { input });
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
  return listen<ScanProgressEventPayload>("v2-scan-progress", (event) => {
    handler(normalizeScanProgress(event.payload));
  });
}
