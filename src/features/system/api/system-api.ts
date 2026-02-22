import { tauriInvoke } from "@/shared/api/tauri-client";

export type DependencyStatus = {
  ytDlpInstalled: boolean;
  ffmpegInstalled: boolean;
  ffprobeInstalled: boolean;
  denoInstalled: boolean;
  ytDlpPath: string | null;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  denoPath: string | null;
};

export async function getDependenciesStatus() {
  return tauriInvoke<DependencyStatus>("v2_dependencies_status");
}

export async function installDependencies() {
  return tauriInvoke<string>("v2_dependencies_install");
}
