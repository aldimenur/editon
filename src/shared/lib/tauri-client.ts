import { invoke } from "@tauri-apps/api/core";

export function canUseTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function tauriInvoke<T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  if (!canUseTauri()) {
    throw new Error("Tauri runtime is not available");
  }

  return invoke<T>(command, payload);
}
