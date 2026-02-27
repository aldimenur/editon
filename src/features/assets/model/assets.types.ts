import type { AssetItem } from "@/entities/asset/model/asset.types";
import type { ScanProgress } from "@/features/assets/api/assets-api";

export type AssetsState = {
  items: AssetItem[];
  page: number;
  totalPages: number;
  totalItems: number;
  rootPath: string;
  scanId: string | null;
  scanProgress: ScanProgress | null;
  loading: boolean;
  error: string | null;
};
