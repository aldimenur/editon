import type { JobItem } from "@/entities/job/model/job.types";

export type JobsState = {
  items: JobItem[];
  loading: boolean;
  error: string | null;
};
