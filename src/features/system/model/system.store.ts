import { create } from "zustand";

import {
  getDependenciesStatus,
  installDependencies,
  type DependencyStatus,
} from "@/features/system/api/system-api";

type SystemStore = {
  dependencies: DependencyStatus | null;
  statusMessage: string;
  loading: boolean;
  error: string | null;
  checkDependencies: () => Promise<void>;
  queueInstall: () => Promise<void>;
};

export const useSystemStore = create<SystemStore>((set) => ({
  dependencies: null,
  statusMessage: "Ready.",
  loading: false,
  error: null,
  checkDependencies: async () => {
    set({ loading: true });
    try {
      const dependencies = await getDependenciesStatus();
      set({
        dependencies,
        statusMessage: "System status updated.",
        error: null,
      });
    } catch (reason) {
      set({
        error:
          reason instanceof Error
            ? reason.message
            : "Failed to load system status",
      });
    } finally {
      set({ loading: false });
    }
  },
  queueInstall: async () => {
    set({ loading: true });
    try {
      const statusMessage = await installDependencies();
      set({ statusMessage, error: null });
    } catch (reason) {
      set({
        error:
          reason instanceof Error
            ? reason.message
            : "Failed to queue dependency install",
      });
    } finally {
      set({ loading: false });
    }
  },
}));
