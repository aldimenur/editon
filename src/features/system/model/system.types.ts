import type { DependencyStatus } from "@/features/system/api/system-api";

export type SystemState = {
  dependencies: DependencyStatus | null;
  statusMessage: string;
  loading: boolean;
  error: string | null;
};
