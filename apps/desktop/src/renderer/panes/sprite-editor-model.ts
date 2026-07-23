import type { SpriteEditorAsset } from "../../shared/ipc";

export interface SpriteFrameCell {
  index: number;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export function spriteFrameCells(
  asset: SpriteEditorAsset,
  width: number,
  height: number,
): SpriteFrameCell[] {
  const frameWidth = asset.frameSize?.[0] || width;
  const frameHeight = asset.frameSize?.[1] || height;
  const usedColumns = Math.max(
    1,
    asset.sheet?.usedColumns || Math.floor(width / frameWidth) || 1,
  );
  const usedRows = Math.max(
    1,
    asset.sheet?.usedRows || Math.floor(height / frameHeight) || 1,
  );
  const cells: SpriteFrameCell[] = [];
  for (let row = 0; row < usedRows; row += 1) {
    for (let column = 0; column < usedColumns; column += 1) {
      const view = asset.frames > 1 ? asset.views[row] : asset.views[column];
      const frame = asset.frames > 1 ? column : 0;
      cells.push({
        index: cells.length,
        column,
        row,
        x: column * frameWidth,
        y: row * frameHeight,
        width: Math.min(frameWidth, width - column * frameWidth),
        height: Math.min(frameHeight, height - row * frameHeight),
        label: `${view || "front"}${asset.frames > 1 ? ` · ${frame + 1}/${asset.frames}` : ""}`,
      });
    }
  }
  return cells.filter((cell) => cell.width > 0 && cell.height > 0);
}

export function pointerToPixel(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
  frame: Pick<SpriteFrameCell, "x" | "y" | "width" | "height">,
): { x: number; y: number } | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const localX = Math.floor(
    ((clientX - bounds.left) / bounds.width) * frame.width,
  );
  const localY = Math.floor(
    ((clientY - bounds.top) / bounds.height) * frame.height,
  );
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= frame.width ||
    localY >= frame.height
  )
    return null;
  return { x: frame.x + localX, y: frame.y + localY };
}

export function offPalettePixelCount(
  data: Uint8ClampedArray,
  palette: readonly string[],
): number {
  const allowed = new Set(palette.map((hex) => hex.slice(1).toLowerCase()));
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if ((data[offset + 3] ?? 0) === 0) continue;
    const hex = [data[offset], data[offset + 1], data[offset + 2]]
      .map((value) => (value ?? 0).toString(16).padStart(2, "0"))
      .join("");
    if (!allowed.has(hex)) count += 1;
  }
  return count;
}
