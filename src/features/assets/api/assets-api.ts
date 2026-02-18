import { invoke } from "@tauri-apps/api/core";

import type { AssetType } from "@/features/assets/model/types";
import type { AssetQueryParams, PaginatedResponse } from "@/types/tauri";

type CountableAssetType = Exclude<AssetType, "all">;

export async function getAssetsPaginated(
  page: number,
  pageSize: number,
  assetType: AssetType,
  queryParams: AssetQueryParams,
): Promise<PaginatedResponse> {
  return invoke<PaginatedResponse>("get_assets_paginated", {
    page,
    pageSize,
    queryParams: {
      ...queryParams,
      assetType,
    },
  });
}

export async function getAssetCount(
  assetType: CountableAssetType,
): Promise<number> {
  return invoke<number>("get_count_assets", {
    assetType,
  });
}

export async function countAssets(): Promise<{
  audio: number;
  video: number;
  image: number;
}> {
  const [audio, video, image] = await Promise.all([
    getAssetCount("audio"),
    getAssetCount("video"),
    getAssetCount("image"),
  ]);

  return {
    audio,
    video,
    image,
  };
}
