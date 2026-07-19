import type {
  AlphaBounds,
  AlphaMargins,
  AssetQaPadHorizontalCellsOperation,
  DarkFringeOptions,
  EdgeQualityMetrics,
  EdgeQualityOptions,
  PixelRect,
  RgbaImage,
} from "./types.ts";

const DEFAULT_ALPHA_THRESHOLD = 16;

function assertByte(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new Error(`${label} must be between 0 and 255, got ${value}`);
  }
}

export function assertRgbaImage(image: RgbaImage): void {
  if (!Number.isInteger(image.width) || image.width <= 0) throw new Error(`invalid RGBA width: ${image.width}`);
  if (!Number.isInteger(image.height) || image.height <= 0) throw new Error(`invalid RGBA height: ${image.height}`);
  const expected = image.width * image.height * 4;
  if (image.data.length !== expected) {
    throw new Error(`expected RGBA buffer length ${expected}, got ${image.data.length}`);
  }
}

export function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

/** Rec. 709 luma, used by the edge-quality rematte and metric. */
export function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Simple channel-average luma, retained for the conservative dark-fringe classifier. */
export function averageLuma(red: number, green: number, blue: number): number {
  return (red + green + blue) / 3;
}

export function alphaBounds(image: RgbaImage, alphaThreshold = 0): AlphaBounds | null {
  assertRgbaImage(image);
  assertByte(alphaThreshold, "alpha threshold");
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((image.data[pixelOffset(image.width, x, y) + 3] ?? 0) <= alphaThreshold) continue;
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return pixels === 0 ? null : { minX, minY, maxX, maxY, pixels };
}

export function alphaMargins(bounds: AlphaBounds | null, width: number, height: number): AlphaMargins | null {
  if (!bounds) return null;
  return {
    left: bounds.minX,
    top: bounds.minY,
    right: width - 1 - bounds.maxX,
    bottom: height - 1 - bounds.maxY,
  };
}

export function countBorderAlphaPixels(image: RgbaImage, alphaThreshold = 0): number {
  assertRgbaImage(image);
  assertByte(alphaThreshold, "alpha threshold");
  let pixels = 0;
  for (let x = 0; x < image.width; x += 1) {
    if ((image.data[pixelOffset(image.width, x, 0) + 3] ?? 0) > alphaThreshold) pixels += 1;
    if (image.height > 1 && (image.data[pixelOffset(image.width, x, image.height - 1) + 3] ?? 0) > alphaThreshold) {
      pixels += 1;
    }
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    if ((image.data[pixelOffset(image.width, 0, y) + 3] ?? 0) > alphaThreshold) pixels += 1;
    if (image.width > 1 && (image.data[pixelOffset(image.width, image.width - 1, y) + 3] ?? 0) > alphaThreshold) {
      pixels += 1;
    }
  }
  return pixels;
}

export function hasTransparentNeighbor(
  image: RgbaImage,
  x: number,
  y: number,
  alphaThreshold = DEFAULT_ALPHA_THRESHOLD,
): boolean {
  for (let yy = Math.max(0, y - 1); yy <= Math.min(image.height - 1, y + 1); yy += 1) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(image.width - 1, x + 1); xx += 1) {
      if (xx === x && yy === y) continue;
      if ((image.data[pixelOffset(image.width, xx, yy) + 3] ?? 0) < alphaThreshold) return true;
    }
  }
  return false;
}

export function cropForBounds(
  bounds: Omit<AlphaBounds, "pixels"> | null,
  sourceWidth: number,
  sourceHeight: number,
  padding = 0,
): PixelRect {
  if (!bounds) throw new Error("cannot crop empty alpha bounds");
  if (!Number.isInteger(padding) || padding < 0) throw new Error(`invalid crop padding: ${padding}`);
  if (
    bounds.minX < 0 ||
    bounds.minY < 0 ||
    bounds.maxX < bounds.minX ||
    bounds.maxY < bounds.minY ||
    bounds.maxX >= sourceWidth ||
    bounds.maxY >= sourceHeight
  ) {
    throw new Error(
      `crop bounds ${bounds.minX},${bounds.minY}..${bounds.maxX},${bounds.maxY} are outside ${sourceWidth}x${sourceHeight}`,
    );
  }
  const x = Math.max(0, bounds.minX - padding);
  const y = Math.max(0, bounds.minY - padding);
  const maxX = Math.min(sourceWidth - 1, bounds.maxX + padding);
  const maxY = Math.min(sourceHeight - 1, bounds.maxY + padding);
  return { x, y, width: maxX - x + 1, height: maxY - y + 1 };
}

export function copyRgbaCrop(image: RgbaImage, crop: PixelRect): RgbaImage {
  assertRgbaImage(image);
  if (
    !Number.isInteger(crop.x) ||
    !Number.isInteger(crop.y) ||
    !Number.isInteger(crop.width) ||
    !Number.isInteger(crop.height) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > image.width ||
    crop.y + crop.height > image.height
  ) {
    throw new Error(`crop ${JSON.stringify(crop)} is outside ${image.width}x${image.height}`);
  }

  const data = Buffer.alloc(crop.width * crop.height * 4);
  for (let row = 0; row < crop.height; row += 1) {
    const sourceStart = pixelOffset(image.width, crop.x, crop.y + row);
    const sourceEnd = sourceStart + crop.width * 4;
    image.data.copy(data, row * crop.width * 4, sourceStart, sourceEnd);
  }
  return { data, width: crop.width, height: crop.height };
}

export function padHorizontalCells(
  image: RgbaImage,
  options: AssetQaPadHorizontalCellsOperation,
): RgbaImage & { targetCellWidth: number } {
  assertRgbaImage(image);
  if (!Number.isInteger(options.columns) || options.columns <= 0) {
    throw new Error("pad-horizontal-cells requires a positive integer column count");
  }
  const padding = {
    bottom: options.padding?.bottom ?? 0,
    left: options.padding?.left ?? 0,
    right: options.padding?.right ?? 0,
    top: options.padding?.top ?? 0,
  };
  for (const [edge, value] of Object.entries(padding)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`invalid ${edge} padding: ${value}`);
  }

  const targetCellWidth = options.targetCellWidth ?? Math.ceil(image.width / options.columns) + padding.left + padding.right;
  const width = targetCellWidth * options.columns;
  const height = options.targetHeight ?? image.height + padding.top + padding.bottom;
  if (!Number.isInteger(targetCellWidth) || targetCellWidth <= 0) throw new Error(`invalid target cell width: ${targetCellWidth}`);
  if (!Number.isInteger(height) || height <= 0) throw new Error(`invalid target height: ${height}`);
  const data = Buffer.alloc(width * height * 4);

  for (let column = 0; column < options.columns; column += 1) {
    const sourceLeft = Math.round((column * image.width) / options.columns);
    const sourceRight = Math.round(((column + 1) * image.width) / options.columns);
    const sourceCellWidth = sourceRight - sourceLeft;
    const targetLeft = column * targetCellWidth + padding.left;
    if (targetLeft + sourceCellWidth > (column + 1) * targetCellWidth) {
      throw new Error(`target cell width ${targetCellWidth} is too small for source cell ${sourceCellWidth}`);
    }
    if (padding.top + image.height > height) {
      throw new Error(`target height ${height} is too small for source height ${image.height}`);
    }
    for (let y = 0; y < image.height; y += 1) {
      const sourceStart = pixelOffset(image.width, sourceLeft, y);
      const sourceEnd = sourceStart + sourceCellWidth * 4;
      const targetStart = pixelOffset(width, targetLeft, padding.top + y);
      image.data.copy(data, targetStart, sourceStart, sourceEnd);
    }
  }
  return { data, width, height, targetCellWidth };
}

export function nearestForegroundColor(
  image: RgbaImage,
  x: number,
  y: number,
  options: EdgeQualityOptions = {},
): readonly [number, number, number] | null {
  const maxRadius = options.maxRadius ?? 8;
  const minAlpha = options.minAlpha ?? 180;
  const minLuma = options.minLuma ?? 30;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let yy = Math.max(0, y - radius); yy <= Math.min(image.height - 1, y + radius); yy += 1) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(image.width - 1, x + radius); xx += 1) {
        if (xx === x && yy === y) continue;
        const offset = pixelOffset(image.width, xx, yy);
        if ((image.data[offset + 3] ?? 0) < minAlpha) continue;
        if (luma(image.data[offset] ?? 0, image.data[offset + 1] ?? 0, image.data[offset + 2] ?? 0) < minLuma) continue;
        red += image.data[offset] ?? 0;
        green += image.data[offset + 1] ?? 0;
        blue += image.data[offset + 2] ?? 0;
        count += 1;
      }
    }
    if (count > 0) return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
  }
  return null;
}

export function rematteDarkEdgePixels(image: RgbaImage, options: EdgeQualityOptions = {}): number {
  assertRgbaImage(image);
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
  const includeOpaque = options.includeOpaque ?? false;
  const minLumaDelta = options.minLumaDelta ?? 18;
  const source: RgbaImage = { ...image, data: Buffer.from(image.data) };
  let changed = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = pixelOffset(image.width, x, y);
      const alpha = source.data[offset + 3] ?? 0;
      if (alpha < alphaThreshold || (!includeOpaque && alpha >= 250)) continue;
      if (!hasTransparentNeighbor(source, x, y, alphaThreshold)) continue;
      const replacement = nearestForegroundColor(source, x, y, options);
      if (!replacement) continue;
      const current = luma(source.data[offset] ?? 0, source.data[offset + 1] ?? 0, source.data[offset + 2] ?? 0);
      const next = luma(replacement[0], replacement[1], replacement[2]);
      if (next - current < minLumaDelta) continue;
      image.data[offset] = replacement[0];
      image.data[offset + 1] = replacement[1];
      image.data[offset + 2] = replacement[2];
      changed += 1;
    }
  }
  return changed;
}

export function edgeQualityMetrics(image: RgbaImage, options: EdgeQualityOptions = {}): EdgeQualityMetrics {
  assertRgbaImage(image);
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
  let edgePixels = 0;
  let edgeLuma = 0;
  let innerPixels = 0;
  let innerLuma = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = pixelOffset(image.width, x, y);
      const alpha = image.data[offset + 3] ?? 0;
      if (alpha < alphaThreshold) continue;
      const value = luma(image.data[offset] ?? 0, image.data[offset + 1] ?? 0, image.data[offset + 2] ?? 0);
      if (hasTransparentNeighbor(image, x, y, alphaThreshold)) {
        edgePixels += 1;
        edgeLuma += value;
      } else if (alpha > 220) {
        innerPixels += 1;
        innerLuma += value;
      }
    }
  }
  const averageEdgeLuma = edgeLuma / Math.max(1, edgePixels);
  const averageInnerLuma = innerLuma / Math.max(1, innerPixels);
  // The inner/edge delta is only meaningful when both populations exist. A
  // fully opaque image (no edge pixels) or an all-edge sprite (no inner
  // pixels) reports 0 rather than comparing a real average against an empty
  // one, which would guarantee a false pass or fail on maxFringeLuma.
  const fringeLuma = edgePixels === 0 || innerPixels === 0 ? 0 : averageInnerLuma - averageEdgeLuma;
  return {
    edgePixels,
    averageEdgeLuma,
    innerPixels,
    averageInnerLuma,
    fringeLuma,
  };
}

const DEFAULT_DARK_FRINGE: Required<DarkFringeOptions> = {
  alphaMin: 1,
  alphaMax: 249,
  darkLumaMax: 75,
  subjectLumaMin: 90,
  maxRadius: 8,
};

function darkFringeOptions(options: DarkFringeOptions): Required<DarkFringeOptions> {
  return { ...DEFAULT_DARK_FRINGE, ...options };
}

export function isDarkFringePixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
  options: DarkFringeOptions = {},
): boolean {
  const cfg = darkFringeOptions(options);
  if (alpha < cfg.alphaMin || alpha > cfg.alphaMax || averageLuma(red, green, blue) > cfg.darkLumaMax) return false;
  if (red >= 55 && red > green * 1.25 && red > blue * 1.25) return false;
  if (green >= 75 && green > red * 1.15 && green > blue * 1.15) return false;
  return Math.max(red, green, blue) - Math.min(red, green, blue) <= 35;
}

function isSubjectReplacementPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
  options: DarkFringeOptions,
): boolean {
  const cfg = darkFringeOptions(options);
  if (alpha < 250) return false;
  if (averageLuma(red, green, blue) >= cfg.subjectLumaMin) return true;
  const redDominant = red >= 100 && red > green * 1.35 && red > blue * 1.2;
  const greenDominant = green >= 95 && green > red * 1.15 && green > blue * 1.15;
  return redDominant || greenDominant;
}

export function replacementColorNear(
  image: RgbaImage,
  x: number,
  y: number,
  options: DarkFringeOptions = {},
): readonly [number, number, number] | null {
  const cfg = darkFringeOptions(options);
  for (let radius = 1; radius <= cfg.maxRadius; radius += 1) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let yy = Math.max(0, y - radius); yy <= Math.min(image.height - 1, y + radius); yy += 1) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(image.width - 1, x + radius); xx += 1) {
        if (xx === x && yy === y) continue;
        const offset = pixelOffset(image.width, xx, yy);
        const r = image.data[offset] ?? 0;
        const g = image.data[offset + 1] ?? 0;
        const b = image.data[offset + 2] ?? 0;
        const a = image.data[offset + 3] ?? 0;
        if (!isSubjectReplacementPixel(r, g, b, a, cfg)) continue;
        red += r;
        green += g;
        blue += b;
        count += 1;
      }
    }
    if (count > 0) return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
  }
  return null;
}

export function measureDarkFringe(image: RgbaImage, options: DarkFringeOptions = {}): {
  darkFringePixels: number;
  semiTransparentPixels: number;
} {
  assertRgbaImage(image);
  let darkFringePixels = 0;
  let semiTransparentPixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = pixelOffset(image.width, x, y);
      const alpha = image.data[offset + 3] ?? 0;
      if (alpha <= 0 || alpha >= 250) continue;
      semiTransparentPixels += 1;
      if (
        isDarkFringePixel(
          image.data[offset] ?? 0,
          image.data[offset + 1] ?? 0,
          image.data[offset + 2] ?? 0,
          alpha,
          options,
        ) &&
        hasTransparentNeighbor(image, x, y, 1)
      ) {
        darkFringePixels += 1;
      }
    }
  }
  return { darkFringePixels, semiTransparentPixels };
}

export function rematteDarkFringe(image: RgbaImage, options: DarkFringeOptions = {}): {
  changedPixels: number;
  remattedPixels: number;
  clearedPixels: number;
} {
  assertRgbaImage(image);
  const source: RgbaImage = { ...image, data: Buffer.from(image.data) };
  let changedPixels = 0;
  let remattedPixels = 0;
  let clearedPixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = pixelOffset(image.width, x, y);
      const red = source.data[offset] ?? 0;
      const green = source.data[offset + 1] ?? 0;
      const blue = source.data[offset + 2] ?? 0;
      const alpha = source.data[offset + 3] ?? 0;
      if (!isDarkFringePixel(red, green, blue, alpha, options) || !hasTransparentNeighbor(source, x, y, 1)) continue;
      const replacement = replacementColorNear(source, x, y, options);
      if (replacement) {
        image.data[offset] = replacement[0];
        image.data[offset + 1] = replacement[1];
        image.data[offset + 2] = replacement[2];
        remattedPixels += 1;
      } else {
        image.data.fill(0, offset, offset + 4);
        clearedPixels += 1;
      }
      changedPixels += 1;
    }
  }
  return { changedPixels, remattedPixels, clearedPixels };
}
