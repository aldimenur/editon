import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export function useAvailableTags(
  parentPath: string,
  setTagFilter: Dispatch<SetStateAction<string[]>>,
) {
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const refreshAvailableTags = useCallback(async () => {
    try {
      const tags = await invoke<string[]>("get_available_tags");
      setAvailableTags(tags);
      setTagFilter((prev) => prev.filter((tag) => tags.includes(tag)));
    } catch (error) {
      console.error("Failed to fetch tags:", error);
      setAvailableTags([]);
      setTagFilter([]);
    }
  }, [setTagFilter]);

  useEffect(() => {
    if (!parentPath) {
      setAvailableTags([]);
      setTagFilter([]);
      return;
    }

    void refreshAvailableTags();
  }, [parentPath, refreshAvailableTags, setTagFilter]);

  return {
    availableTags,
    refreshAvailableTags,
  };
}
