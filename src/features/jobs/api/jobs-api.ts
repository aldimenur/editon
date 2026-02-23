import { listen } from "@tauri-apps/api/event";

import type { JobItem } from "@/entities/job/model/job.types";
import { tauriInvoke } from "@/shared/api/tauri-client";

export type JobEvent = {
  id: number;
  jobType: string;
  status: string;
  message: string;
  progress: number | null;
};

type JobEventPayload = {
  id?: number | string;
  jobType?: string;
  job_type?: string;
  status?: string;
  message?: string;
  progress?: number | string | null;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeJobEvent(payload: JobEventPayload): JobEvent {
  const progress = toNumber(payload.progress);
  return {
    id: toNumber(payload.id) ?? 0,
    jobType: payload.jobType ?? payload.job_type ?? "unknown",
    status: payload.status ?? "queued",
    message: payload.message ?? "",
    progress:
      progress === null
        ? null
        : Math.max(0, Math.min(100, Math.trunc(progress))),
  };
}

export async function listJobs() {
  return tauriInvoke<JobItem[]>("v2_jobs_list", {
    limit: 20,
  });
}

export async function onJobUpdated(
  handler: (payload: JobEvent) => void,
): Promise<() => void> {
  return listen<JobEventPayload>("v2-job-updated", (event) => {
    handler(normalizeJobEvent(event.payload));
  });
}
