// Type surface for the canonical CommonJS manifest writer (./manifest-core.cjs).
// The runtime lives in the .cjs so it can be shared verbatim by the Electron
// desktop main process and by bun-run TypeScript; these declarations give the
// TS side (via the ./manifest.ts facade) full typing over that shared runtime.

export interface AssetEntry {
  id: string;
  kind: string;
  game: string;
  path: string; // relative to the assets root
  prompt?: string;
  provider?: string;
  /** Provider model/plan used, surfaced for sprite + image assets. */
  model?: string;
  /** Sprite-sheet geometry (issue #19); present for sprite/sprite-anim assets. */
  dimensions?: [number, number];
  frameSize?: [number, number];
  frames?: number;
  fps?: number;
  anchor?: [number, number];
  scale?: number;
  views?: string[];
  sheet?: {
    columns: number;
    rows: number;
    usedColumns: number;
    usedRows: number;
  };
  /** Relative path to a generated billboard preview, if any. */
  preview?: string;
  /** Required provenance/license record (issue #17): no generator may skip this. */
  license: AssetLicenseRecord;
}

export interface AssetLicenseRecord {
  /** Generation or conversion tool, e.g. "codex", "openai", "ffmpeg". */
  tool: string;
  /** Tool plan/model/preset used for reviewable provenance. */
  plan: string;
  /** ISO calendar date when the final asset was produced. */
  date: string;
  /** Asset kind covered by this license/provenance record. */
  kind: string;
  /** Optional AI-generation disclosure (issue #19 sprites / #59 legal). */
  type?: string;
  terms?: string;
  url?: string;
  generatedAt?: string;
}

/** Required provenance fields; every registered asset must carry all four. */
export declare const REQUIRED_LICENSE_FIELDS: readonly ["tool", "plan", "date", "kind"];

/** Upsert an asset entry into a game's assets.json (single source of truth). */
export declare function register(manifestPath: string, entry: AssetEntry): Promise<void>;

/** Throw unless the entry carries a complete, non-empty license record. */
export declare function assertLicenseRecord(entry: AssetEntry): void;
