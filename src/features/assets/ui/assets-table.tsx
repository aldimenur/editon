import { convertFileSrc } from "@tauri-apps/api/core";

import type { AssetItem } from "@/entities/asset/model/asset.types";
import { formatDate } from "@/shared/lib/format/date";
import { formatFileSize } from "@/shared/lib/format/file-size";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { Table } from "@/shared/ui/table";

type AssetsTableProps = {
  items: AssetItem[];
};

function AssetThumbnail({ asset }: { asset: AssetItem }) {
  if (asset.typeName !== "video") {
    return <span className="muted">-</span>;
  }

  if (!asset.thumbnailPath) {
    return <span className="muted">pending</span>;
  }

  const src = isTauriRuntime()
    ? convertFileSrc(asset.thumbnailPath)
    : asset.thumbnailPath;
  return (
    <img className="thumb" src={src} alt={asset.filename} loading="lazy" />
  );
}

export function AssetsTable({ items }: AssetsTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Size</th>
          <th>Preview</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {items.map((asset) => (
          <tr key={asset.id}>
            <td>{asset.filename}</td>
            <td>{asset.typeName}</td>
            <td>{formatFileSize(asset.fileSize)}</td>
            <td>
              <AssetThumbnail asset={asset} />
            </td>
            <td>{formatDate(asset.dateModified)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
