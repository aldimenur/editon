import type { DependenciesCheckResponse } from "@/features/youtube-download/model/types";

export async function checkDependencies(): Promise<DependenciesCheckResponse> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DependenciesCheckResponse>("check_dependencies");
}

export async function downloadDependencies(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("download_dependencies");
}

export async function runYtdlp(args: string[]): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("run_ytdlp", { args });
}

export async function browseDownloadDirectory(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ directory: true });
  if (typeof path === "string") {
    return path;
  }

  return null;
}
