import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ModelOptimizeResult } from "./model3d.ts";

export const MODEL_OPTIMIZE_REPORT_VERSION = 1;
export const LARGE_MODEL_SOURCE_BYTES = 20 * 1024 * 1024;

const execFileAsync = promisify(execFile);

export interface ModelFileRecord {
  path: string;
  sha256: string;
  bytes: number;
}

export interface ModelOptimizeReport {
  schemaVersion: typeof MODEL_OPTIMIZE_REPORT_VERSION;
  source: ModelFileRecord;
  output: ModelFileRecord;
  compression: ModelOptimizeResult["compression"];
  summary: ModelOptimizeResult["summary"];
  animations: string[];
  generatedAt: string;
}

export function modelSha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function modelFileRecord(data: Buffer, path: string): ModelFileRecord {
  return { path, sha256: modelSha256(data), bytes: data.length };
}

export function buildModelOptimizeReport(options: {
  source: Buffer;
  sourcePath: string;
  optimized: ModelOptimizeResult;
  outputPath: string;
  generatedAt: Date | string;
}): ModelOptimizeReport {
  return {
    schemaVersion: MODEL_OPTIMIZE_REPORT_VERSION,
    source: modelFileRecord(options.source, options.sourcePath),
    output: modelFileRecord(options.optimized.data, options.outputPath),
    compression: options.optimized.compression,
    summary: options.optimized.summary,
    animations: options.optimized.animations,
    generatedAt:
      options.generatedAt instanceof Date ? options.generatedAt.toISOString() : options.generatedAt,
  };
}

export function isGitLfsFilter(output: string): boolean {
  return /:\s*filter:\s*lfs\s*$/m.test(output);
}

/**
 * Large raw provider GLBs may only enter a target repository through Git LFS.
 * Small fixtures and hand-built models stay frictionless; provider-scale sources
 * fail before any runtime/manifest write if the target repo lacks LFS coverage.
 */
export async function assertLargeModelSourceUsesLfs(options: {
  assetsRoot: string;
  sourcePath: string;
  bytes: number;
}): Promise<void> {
  if (options.bytes <= LARGE_MODEL_SOURCE_BYTES) return;
  let stdout = "";
  try {
    const result = await execFileAsync(
      "git",
      ["-C", options.assetsRoot, "check-attr", "filter", "--", options.sourcePath],
      { encoding: "utf8" },
    );
    stdout = String(result.stdout);
  } catch {
    // The actionable policy error below covers both non-git targets and command failures.
  }
  if (!isGitLfsFilter(stdout)) {
    throw new Error(
      `raw model is ${options.bytes} bytes; ${options.sourcePath} must be covered by Git LFS before generation`,
    );
  }
}
