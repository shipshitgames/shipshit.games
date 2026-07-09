export interface RgbaImage {
  data: Buffer;
  width: number;
  height: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlphaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
}

export interface AlphaMargins {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface EdgeQualityOptions {
  alphaThreshold?: number;
  includeOpaque?: boolean;
  maxRadius?: number;
  minAlpha?: number;
  minLuma?: number;
  minLumaDelta?: number;
}

export interface DarkFringeOptions {
  alphaMin?: number;
  alphaMax?: number;
  darkLumaMax?: number;
  subjectLumaMin?: number;
  maxRadius?: number;
}

export interface EdgeQualityMetrics {
  edgePixels: number;
  averageEdgeLuma: number;
  innerPixels: number;
  averageInnerLuma: number;
  fringeLuma: number;
}

export interface AlphaQualityMetrics {
  bounds: AlphaBounds | null;
  margins: AlphaMargins | null;
  borderPixels: number;
  semiTransparentPixels: number;
  darkFringePixels: number;
  edge: EdgeQualityMetrics;
}

export type WebpEncodingKind = "lossless" | "lossy" | "unknown";

export interface AssetQaDimensionsCheck {
  width?: number;
  height?: number;
}

export interface AssetQaAlphaCheck {
  /** Alpha values at or below this value are transparent. Default: 0. */
  threshold?: number;
  minMargins?: number | Partial<AlphaMargins>;
  maxBorderPixels?: number;
  maxDarkFringePixels?: number;
  maxFringeLuma?: number;
  darkFringe?: DarkFringeOptions;
  edge?: EdgeQualityOptions;
}

export interface AssetQaChecks {
  dimensions?: AssetQaDimensionsCheck;
  alpha?: AssetQaAlphaCheck;
  webpEncoding?: Exclude<WebpEncodingKind, "unknown">;
}

export interface AssetQaCropOperation {
  /** Explicit source-space bounds, typically selected from an atlas. */
  bounds?: Omit<AlphaBounds, "pixels">;
  /** Derive bounds from the source image alpha instead of declaring them. */
  alpha?: true;
  padding?: number;
  alphaThreshold?: number;
}

export interface AssetQaPadding {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

export interface AssetQaPadHorizontalCellsOperation {
  columns: number;
  padding?: AssetQaPadding;
  targetCellWidth?: number;
  targetHeight?: number;
}

export interface AssetQaRematteOperation {
  mode: "dark-edge" | "dark-fringe";
  maxPasses?: number;
  options?: EdgeQualityOptions & DarkFringeOptions;
}

export interface AssetQaWebpOutput {
  format: "webp";
  lossless: boolean;
  quality?: number;
  method?: number;
  exact?: boolean;
}

export interface AssetQaRepair {
  /** Relative to the manifest root. Defaults to the target path. */
  source?: string;
  expectedSource?: {
    width: number;
    height: number;
  };
  crop?: AssetQaCropOperation;
  padHorizontalCells?: AssetQaPadHorizontalCellsOperation;
  rematte?: AssetQaRematteOperation;
  output: AssetQaWebpOutput;
}

export interface AssetQaTarget {
  id: string;
  /** Relative to the manifest root. Absolute and escaping paths are rejected. */
  path: string;
  checks: AssetQaChecks;
  repair?: AssetQaRepair;
}

export interface AssetQaManifest {
  schemaVersion: 1;
  /** Relative to the manifest file. Overridden by CLI/API root options. */
  root?: string;
  targets: AssetQaTarget[];
}

export interface AssetQaDiagnostic {
  code: string;
  message: string;
  actual?: number | string | AlphaMargins | null;
  expected?: number | string | Partial<AlphaMargins>;
}

export interface AssetQaTargetMetrics {
  width: number;
  height: number;
  bytes: number;
  alpha: AlphaQualityMetrics;
  webpEncoding: WebpEncodingKind;
}

export interface AssetQaTargetReport {
  id: string;
  path: string;
  ok: boolean;
  metrics: AssetQaTargetMetrics | null;
  diagnostics: AssetQaDiagnostic[];
}

export interface AssetQaCheckReport {
  schemaVersion: 1;
  command: "check";
  ok: boolean;
  manifest: string;
  root: string;
  targets: AssetQaTargetReport[];
}

export interface AssetQaMutationTargetReport {
  id: string;
  path: string;
  source: string;
  changed: boolean;
  operations: string[];
  remattedPixels: number;
  clearedPixels: number;
  passes: number;
  validation: AssetQaTargetReport;
}

export interface AssetQaRepairReport {
  schemaVersion: 1;
  command: "repair";
  ok: boolean;
  manifest: string;
  root: string;
  targets: AssetQaMutationTargetReport[];
}

export interface AssetQaRunOptions {
  manifestPath: string;
  root?: string;
  targetIds?: readonly string[];
}
