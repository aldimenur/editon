import { create } from "zustand";

import { listJobs } from "@/features/jobs/api/jobs-api";

type JobsStore = {
  items: Array<{
    id: number;
    jobType: string;
    status: string;
    priority: number;
    attempts: number;
    payload: string;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useJobsStore = create<JobsStore>((set) => ({
  items: [],
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true });
    try {
      const items = await listJobs();
      set({ items, error: null });
    } catch (reason) {
      set({
        error: reason instanceof Error ? reason.message : "Failed to load jobs",
      });
    } finally {
      set({ loading: false });
    }
  },
}));
