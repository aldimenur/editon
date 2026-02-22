import type { JobItem } from "@/entities/job/model/job.types";
import { tauriInvoke } from "@/shared/api/tauri-client";

export async function listJobs() {
  return tauriInvoke<JobItem[]>("v2_jobs_list", {
    limit: 20,
  });
}
