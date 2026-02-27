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
