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
  [key: string]: any; // For flexible metadata
}

export interface Asset {
  id?: number; // Optional because it's auto-generated on insert
  uuid: string;
  filename: string;
  extension: string;
  original_path: string;
  type_name: string; // 'audio', 'video', 'image'
  
  thumbnail_path?: string;
  duration_sec: number;
  file_size: number;
  
  // Waveform stored as binary data (array of floats)
  waveform_data?: number[];
  
  // Flexible metadata
  metadata: AssetMetadata;
}

export interface PaginatedResponse {
  data: Asset[];
  total_items: number;
  total_pages: number;
  current_page: number;
}

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}
