import { canUseTauri } from "@/shared/api/tauri-client";

export function isTauriRuntime() {
  return canUseTauri();
}
