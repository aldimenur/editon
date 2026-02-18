// Type definitions for Tauri backend commands

export interface AssetMetadata {
  sample_rate?: number;
  channels?: number;
  bit_depth?: number;
  codec?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  frame_rate?: number;
  color_space?: string;
  [key: string]: unknown; // For flexible metadata
}

export interface Asset {
  id?: number; // Optional because it's auto-generated on insert
  filename: string;
  extension: string;
  original_path: string;
  type_name: string; // 'audio', 'video', 'image'

  thumbnail_path?: string;
  thumbnail_blob?: number[];
  duration_sec: number;
  file_size: number;

  // Waveform stored as binary data (array of floats)
  waveform_data?: number[];

  // Flexible metadata
  metadata: AssetMetadata;

  // Tags for organizing assets
  tags?: string | null;

  date_created: string;
  date_modified: string;
}

export interface AssetQueryParams {
  search?: string;
  assetType?: string;
  tags?: string[];
  sortBy?:
    | "filename"
    | "file_size"
    | "duration"
    | "duration_sec"
    | "date_created"
    | "date_modified";
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse {
  data: Asset[];
  total_items: number;
  total_pages: number;
  current_page: number;
}

export interface TrimMediaInput {
  input_path: string;
  start_sec: number;
  end_sec: number;
  output_path?: string | null;
}

export type TrimMediaResult = string;
