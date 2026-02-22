import { listen } from "@tauri-apps/api/event";

import type { JobItem } from "@/entities/job/model/job.types";
import { tauriInvoke } from "@/shared/api/tauri-client";

export type JobEvent = {
  id: number;
  jobType: string;
  status: string;
  message: string;
};

export async function listJobs() {
  return tauriInvoke<JobItem[]>("v2_jobs_list", {
    limit: 20,
  });
}

export async function onJobUpdated(
  handler: (payload: JobEvent) => void,
): Promise<() => void> {
  return listen<JobEvent>("v2-job-updated", (event) => {
    handler(event.payload);
  });
}
