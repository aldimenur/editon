import { tauriInvoke } from "@/shared/lib/tauri-client";
import { listen } from "@tauri-apps/api/event";

export type AssetItem = {
  id: number;
  filename: string;
  extension: string;
  originalPath: string;
  typeName: string;
  fileSize: number;
  mtimeMs: number;
  tags: string[];
  waveformData: number[] | null;
  dateModified: string;
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

export type JobItem = {
  id: number;
  jobType: string;
  status: string;
  priority: number;
  attempts: number;
  payload: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DependencyStatus = {
  ytDlpInstalled: boolean;
  ffmpegInstalled: boolean;
  ffprobeInstalled: boolean;
  denoInstalled: boolean;
  ytDlpPath: string | null;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  denoPath: string | null;
};

export type ScanProgress = {
  scanId: string;
  count: number;
  lastFile: string;
  status: string;
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

export async function listJobs() {
  return tauriInvoke<JobItem[]>("v2_jobs_list", {
    limit: 20,
  });
}

export async function getDependenciesStatus() {
  return tauriInvoke<DependencyStatus>("v2_dependencies_status");
}

export async function installDependencies() {
  return tauriInvoke<string>("v2_dependencies_install");
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
