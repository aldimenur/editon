import { useCallback, useState } from "react";

import { trimMediaAction } from "@/lib/actions/trim-media";
import type { TrimMediaInput, TrimMediaResult } from "@/types/tauri";

interface UseTrimMediaState {
  isTrimming: boolean;
  error: string | null;
  lastOutputPath: string | null;
}

interface UseTrimMediaReturn extends UseTrimMediaState {
  trimMedia: (payload: TrimMediaInput) => Promise<TrimMediaResult>;
  resetTrimState: () => void;
}

export function useTrimMedia(): UseTrimMediaReturn {
  const [isTrimming, setIsTrimming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOutputPath, setLastOutputPath] = useState<string | null>(null);

  const trimMedia = useCallback(async (payload: TrimMediaInput) => {
    setIsTrimming(true);
    setError(null);

    try {
      const outputPath = await trimMediaAction(payload);
      setLastOutputPath(outputPath);
      return outputPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsTrimming(false);
    }
  }, []);

  const resetTrimState = useCallback(() => {
    setError(null);
    setLastOutputPath(null);
  }, []);

  return {
    isTrimming,
    error,
    lastOutputPath,
    trimMedia,
    resetTrimState,
  };
}
