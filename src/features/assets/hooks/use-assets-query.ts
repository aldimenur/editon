import { useEffect, useRef, useState } from "react";

import {
  ASSETS_PAGE_SIZE,
  ASSET_SEARCH_DEBOUNCE_MS,
} from "@/features/assets/constants";
import type { AssetType } from "@/features/assets/model/types";

type SearchState = {
  search: string;
  tags: string[];
};

type FetchGlobalAssets = (
  page: number,
  pageSize: number,
  assetType: AssetType,
  reset?: boolean,
) => Promise<void>;

type UseAssetsQueryOptions = {
  parentPath: string;
  activeAssetFilter: AssetType;
  initialSearch: SearchState;
  setGlobalSearch: (search: string, tags?: string[]) => void;
  fetchGlobalAssets: FetchGlobalAssets;
  onResetSelection: () => void;
};

export function useAssetsQuery({
  parentPath,
  activeAssetFilter,
  initialSearch,
  setGlobalSearch,
  fetchGlobalAssets,
  onResetSelection,
}: UseAssetsQueryOptions) {
  const [searchValue, setSearchValue] = useState(initialSearch.search);
  const [tagFilter, setTagFilter] = useState<string[]>(initialSearch.tags);
  const lastFetchKeyRef = useRef<string>("");

  const buildFetchKey = (
    path: string,
    filter: AssetType,
    search: string,
    tags: string[],
  ) => `${path}|${filter}|${search.trim()}|${tags.join(",")}`;

  useEffect(() => {
    if (!parentPath) return;

    onResetSelection();
    setGlobalSearch(searchValue, tagFilter);
    lastFetchKeyRef.current = buildFetchKey(
      parentPath,
      activeAssetFilter,
      searchValue,
      tagFilter,
    );
    void fetchGlobalAssets(1, ASSETS_PAGE_SIZE, activeAssetFilter, true);
  }, [
    parentPath,
    activeAssetFilter,
    fetchGlobalAssets,
    onResetSelection,
    setGlobalSearch,
  ]);

  useEffect(() => {
    if (!parentPath) return;

    const timeout = window.setTimeout(() => {
      const nextFetchKey = buildFetchKey(
        parentPath,
        activeAssetFilter,
        searchValue,
        tagFilter,
      );
      if (nextFetchKey === lastFetchKeyRef.current) {
        return;
      }

      lastFetchKeyRef.current = nextFetchKey;
      setGlobalSearch(searchValue, tagFilter);
      void fetchGlobalAssets(1, ASSETS_PAGE_SIZE, activeAssetFilter, true);
    }, ASSET_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [
    parentPath,
    searchValue,
    tagFilter,
    activeAssetFilter,
    setGlobalSearch,
    fetchGlobalAssets,
  ]);

  return {
    searchValue,
    setSearchValue,
    tagFilter,
    setTagFilter,
  };
}
