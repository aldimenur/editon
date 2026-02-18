const previewCache = new Map<string, string>();

function trimText(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}

function getFileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function getDragPreviewIcon(
  path: string,
  label = "Dragging file",
): string {
  const cacheKey = `${label}::${path}`;
  const cached = previewCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 72;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const radius = 10;
  const fileName = getFileNameFromPath(path);

  ctx.fillStyle = "rgba(24, 24, 27, 0.96)";
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(canvas.width - radius, 0);
  ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
  ctx.lineTo(canvas.width, canvas.height - radius);
  ctx.quadraticCurveTo(
    canvas.width,
    canvas.height,
    canvas.width - radius,
    canvas.height,
  );
  ctx.lineTo(radius, canvas.height);
  ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#60a5fa";
  ctx.fillRect(10, 10, 8, canvas.height - 20);
  ctx.fillRect(22, 22, 8, canvas.height - 32);
  ctx.fillRect(34, 16, 8, canvas.height - 24);

  ctx.fillStyle = "#e4e4e7";
  ctx.font = "600 13px sans-serif";
  ctx.fillText(trimText(label, 22), 54, 30);

  ctx.fillStyle = "#a1a1aa";
  ctx.font = "12px sans-serif";
  ctx.fillText(trimText(fileName, 30), 54, 50);

  const dataUrl = canvas.toDataURL("image/png");
  previewCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export function applyDragImage(
  dataTransfer: DataTransfer | null,
  iconDataUrl: string,
  sourcePath: string,
): void {
  if (!dataTransfer) return;

  const image = new Image();
  image.src = iconDataUrl;
  dataTransfer.setData("text/plain", sourcePath);
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setDragImage(image, 20, 20);
}
