export type AssetItem = {
  id: number;
  filename: string;
  extension: string;
  originalPath: string;
  typeName: string;
  thumbnailPath: string | null;
  fileSize: number;
  mtimeMs: number;
  tags: string[];
  waveformData: number[] | null;
  dateModified: string;
};
