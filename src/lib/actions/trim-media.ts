import { invoke } from "@tauri-apps/api/core";

import type { TrimMediaInput, TrimMediaResult } from "@/types/tauri";

function buildDefaultOutputPath(inputPath: string): string {
  const lastForwardSlash = inputPath.lastIndexOf("/");
  const lastBackSlash = inputPath.lastIndexOf("\\");
  const lastSeparator = Math.max(lastForwardSlash, lastBackSlash);

  const separator = lastBackSlash > lastForwardSlash ? "\\" : "/";
  const dir = lastSeparator >= 0 ? inputPath.slice(0, lastSeparator) : "";
  const fileName =
    lastSeparator >= 0 ? inputPath.slice(lastSeparator + 1) : inputPath;

  const lastDot = fileName.lastIndexOf(".");
  const stem = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const ext = lastDot > 0 ? fileName.slice(lastDot + 1) : "bin";
  const trimmedName = `${stem}_trim_${Date.now()}.${ext}`;

  if (!dir) {
    return lastSeparator === 0 ? `${separator}${trimmedName}` : trimmedName;
  }

  return `${dir}${separator}${trimmedName}`;
}

export async function trimMediaAction(
  payload: TrimMediaInput,
): Promise<TrimMediaResult> {
  const inputPath = payload.input_path.trim();
  const startSec = payload.start_sec;
  const endSec = payload.end_sec;

  if (!inputPath) {
    throw new Error("input_path is required");
  }

  if (startSec < 0) {
    throw new Error("start_sec must be >= 0");
  }

  if (endSec <= startSec) {
    throw new Error("end_sec must be greater than start_sec");
  }

  const outputPath = payload.output_path?.trim()
    ? payload.output_path.trim()
    : buildDefaultOutputPath(inputPath);

  return invoke<TrimMediaResult>("trim_media", {
    inputPath,
    startSec,
    endSec,
    outputPath,
  });
}
