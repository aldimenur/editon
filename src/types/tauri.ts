// Type definitions for Tauri backend commands

export interface Asset {
  id: number;
  name: string;
  path: string;
  size: number;
}

export interface PaginatedAssets {
  assets: Asset[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}
