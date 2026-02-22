import { listen } from "@tauri-apps/api/event";

import type { AssetItem } from "@/entities/asset/model/asset.types";
import { tauriInvoke } from "@/shared/api/tauri-client";

export type ScanProgress = {
  scanId: string;
  count: number;
  lastFile: string;
  status: string;
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

export async function onScanProgress(
  handler: (payload: ScanProgress) => void,
): Promise<() => void> {
  return listen<ScanProgress>("v2-scan-progress", (event) => {
    handler(event.payload);
  });
}
