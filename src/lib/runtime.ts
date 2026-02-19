/**
 * Runtime detection utilities for Tauri vs Browser environments.
 *
 * This module provides a safe way to detect whether the app is running
 * in a Tauri desktop runtime or a standard browser. Useful for browser-based
 * QA testing where Tauri APIs are not available.
 */

interface TauriGlobal {
  __TAURI_INTERNALS__?: object;
  __TAURI__?: object;
}

/**
 * Checks if the current runtime is Tauri (desktop app).
 *
 * This function is safe to call in any environment:
 * - In Tauri: returns true
 * - In browser: returns false (no crash)
 * - In SSR/Node: returns false
 *
 * Note: In Tauri v2, `__TAURI__` is only available if `withGlobalTauri` is
 * enabled in tauri.conf.json. The `__TAURI_INTERNALS__` symbol is more
 * reliably present in v2 defaults.
 *
 * @returns true if running in Tauri, false otherwise
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const tauriWindow = window as Window & TauriGlobal;

  // Primary check: __TAURI_INTERNALS__ is reliable in Tauri v2
  if ("__TAURI_INTERNALS__" in tauriWindow) {
    return true;
  }

  // Fallback: __TAURI__ may be present if withGlobalTauri is enabled
  return Boolean(tauriWindow.__TAURI__);
}

function getWindowLocationSearch(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.search;
}

export function isBrowserQaMode(): boolean {
  if (isTauriRuntime()) {
    return false;
  }

  const search = getWindowLocationSearch();
  if (!search) {
    return false;
  }

  const params = new URLSearchParams(search);
  return params.get("qa") === "1";
}

export function getQaFlag(name: string): string | null {
  const search = getWindowLocationSearch();
  if (!search) {
    return null;
  }

  const params = new URLSearchParams(search);
  return params.get(name);
}
