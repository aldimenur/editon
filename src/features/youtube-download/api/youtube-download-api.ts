import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { DependenciesCheckResponse } from "@/features/youtube-download/model/types";

export async function checkDependencies(): Promise<DependenciesCheckResponse> {
  return invoke<DependenciesCheckResponse>("check_dependencies");
}

export async function downloadDependencies(): Promise<string> {
  return invoke<string>("download_dependencies");
}

export async function runYtdlp(args: string[]): Promise<string> {
  return invoke<string>("run_ytdlp", { args });
}

export async function browseDownloadDirectory(): Promise<string | null> {
  const path = await open({ directory: true });
  if (typeof path === "string") {
    return path;
  }

  return null;
}
