import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { assetsManifestPath, assetsRootForRepo } from "../drafts.ts";
import { register } from "../manifest.ts";
import type { AssetEntry, ModelCompression } from "../manifest.ts";
import { optimizeGlb } from "../model3d.ts";
import type { ModelOptimizeResult } from "../model3d.ts";
import { buildProvenance } from "../provenance.ts";
import { flag, has } from "./args.ts";
import { runGenerate } from "./generate.ts";
import { defaultRepo } from "./paths.ts";

const MODEL_OPTIMIZE_REPORT_VERSION = 1;

export interface ModelOptimizeReport {
  schemaVersion: typeof MODEL_OPTIMIZE_REPORT_VERSION;
  source: ModelFileRecord;
  output: ModelFileRecord;
  compression: ModelCompression;
  summary: ModelOptimizeResult["summary"];
  animations: string[];
  generatedAt: string;
}

interface ModelFileRecord {
  path: string;
  sha256: string;
  bytes: number;
}

export interface OptimizeModelFileOptions {
  inputPath: string;
  outputPath: string;
  reportPath?: string;
  draco?: boolean;
  ktx2?: boolean;
  now?: () => Date;
}

export interface RegisterModelFileOptions {
  inputPath: string;
  reportPath?: string;
  repo: string;
  id: string;
  game: string;
  provider: string;
  model?: string;
  prompt?: string;
  licenseTerms: string;
  licenseUrl?: string;
  licenseType?: string;
  rigSource?: string;
  now?: () => Date;
}

/**
 * `assetgen model` — explicit 3D workflow over the existing model pipeline.
 *
 * `generate` stages a reviewable draft by default, while `optimize` and
 * `register` let imported/provider GLBs enter the same runtime + manifest
 * contract without bypassing provenance or license checks.
 */
export async function runModelCommand(argv: string[]): Promise<void> {
  const verb = argv[0];
  const rest = argv.slice(1);

  try {
    switch (verb) {
      case "generate":
        await runGenerate(modelGenerateArgs(rest));
        return;
      case "optimize": {
        const inputPath = requiredFlag(rest, "in");
        const outputPath = requiredFlag(rest, "out");
        const result = await optimizeModelFile({
          inputPath,
          outputPath,
          reportPath: flag(rest, "report"),
          draco: !has(rest, "no-draco"),
          ktx2: has(rest, "ktx2"),
        });
        console.log(
          `[model] optimized ${result.report.source.bytes} -> ${result.report.output.bytes} bytes: ${result.outputPath}`,
        );
        console.log(`[model] trace: ${result.reportPath}`);
        return;
      }
      case "register": {
        const game = flag(rest, "game", "shared")!;
        const repo = flag(rest, "repo") || defaultRepo(game);
        const result = await registerModelFile({
          inputPath: requiredFlag(rest, "in"),
          reportPath: flag(rest, "report"),
          repo,
          id: requiredFlag(rest, "id"),
          game,
          provider: requiredFlag(rest, "provider"),
          model: flag(rest, "model"),
          prompt: flag(rest, "prompt"),
          licenseTerms: requiredFlag(rest, "license"),
          licenseUrl: flag(rest, "license-url"),
          licenseType: flag(rest, "license-type"),
          rigSource: flag(rest, "rig"),
        });
        console.log(`[model] registered ${result.entry.id}:${result.entry.kind} -> ${result.outputPath}`);
        console.log(`[manifest] ${result.manifestPath} updated`);
        return;
      }
      default:
        printModelUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`[model] ${String((error as Error)?.message ?? error)}`);
    process.exit(1);
  }
}

/** Default the explicit model workflow to a staged draft; `--publish` opts into the legacy direct write. */
export function modelGenerateArgs(argv: string[]): string[] {
  const next = argv.filter((arg) => arg !== "--publish");
  const kind = flag(next, "kind");
  if (kind && kind !== "model" && kind !== "3d") {
    throw new Error(`model generate only accepts --kind model|3d (received ${JSON.stringify(kind)})`);
  }
  if (!kind) next.push("--kind", "model");
  if (!has(argv, "publish") && !has(next, "draft")) next.push("--draft");
  return next;
}

/** Optimize a raw GLB without deleting it, and write a hash-addressed trace report beside the runtime output. */
export async function optimizeModelFile(
  options: OptimizeModelFileOptions,
): Promise<{ outputPath: string; reportPath: string; report: ModelOptimizeReport }> {
  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(options.outputPath);
  const reportPath = resolve(options.reportPath ?? `${outputPath}.optimize.json`);
  if (inputPath === outputPath) {
    throw new Error("--in and --out must differ so the raw source remains traceable");
  }

  const raw = await readFile(inputPath);
  const optimized = await optimizeGlb(raw, { draco: options.draco, ktx2: options.ktx2 });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, optimized.data);

  const report: ModelOptimizeReport = {
    schemaVersion: MODEL_OPTIMIZE_REPORT_VERSION,
    source: fileRecord(raw, relativeForReport(reportPath, inputPath)),
    output: fileRecord(optimized.data, relativeForReport(reportPath, outputPath)),
    compression: optimized.compression,
    summary: optimized.summary,
    animations: optimized.animations,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  return { outputPath, reportPath, report };
}

/** Copy a verified optimized GLB into the asset tree and upsert its licensed manifest record. */
export async function registerModelFile(
  options: RegisterModelFileOptions,
): Promise<{ outputPath: string; manifestPath: string; entry: AssetEntry }> {
  assertModelId(options.id);
  const inputPath = resolve(options.inputPath);
  const reportPath = resolve(options.reportPath ?? `${inputPath}.optimize.json`);
  const report = await readOptimizeReport(reportPath);
  const sourcePath = await verifyOptimizeReport(inputPath, reportPath, report);
  const rigged = report.summary.skins > 0;
  if (options.rigSource && (options.rigSource === "none") === rigged) {
    throw new Error(`--rig ${options.rigSource} contradicts the model's detected rig state`);
  }

  const assetsRoot = assetsRootForRepo(resolve(options.repo));
  const relPath = `models/${options.id}.glb`;
  const sourceRelPath = `sources/models/${options.id}.glb`;
  const traceRelPath = `sources/models/${options.id}.optimize.json`;
  const outputPath = join(assetsRoot, relPath);
  const registeredSourcePath = join(assetsRoot, sourceRelPath);
  const registeredReportPath = join(assetsRoot, traceRelPath);
  await mkdir(dirname(outputPath), { recursive: true });
  if (resolve(outputPath) !== inputPath) await copyFile(inputPath, outputPath);
  await mkdir(dirname(registeredSourcePath), { recursive: true });
  if (resolve(registeredSourcePath) !== sourcePath) await copyFile(sourcePath, registeredSourcePath);
  await writeFile(
    registeredReportPath,
    JSON.stringify(
      {
        ...report,
        source: { ...report.source, path: relativeForReport(registeredReportPath, registeredSourcePath) },
        output: { ...report.output, path: relativeForReport(registeredReportPath, outputPath) },
      },
      null,
      2,
    ) + "\n",
  );

  const now = options.now?.() ?? new Date();
  const entry: AssetEntry = {
    id: options.id,
    kind: "model",
    game: options.game,
    path: relPath,
    ...(options.prompt ? { prompt: options.prompt } : {}),
    provider: options.provider,
    ...(options.model ? { model: options.model } : {}),
    optimized: true,
    compression: report.compression,
    animations: report.animations,
    meshes: report.summary.meshes,
    materials: report.summary.materials,
    textures: report.summary.textures,
    skins: report.summary.skins,
    joints: report.summary.joints,
    modelTrace: {
      report: traceRelPath,
      source: sourceRelPath,
      sourceSha256: report.source.sha256,
      optimizedSha256: report.output.sha256,
    },
    ...(options.prompt
      ? {
          provenance: buildProvenance({
            provider: options.provider,
            prompt: options.prompt,
            styleSuffix: "",
            date: now,
            meta: { model: options.model, reproducible: false },
          }),
        }
      : {}),
    license: {
      tool: options.provider,
      plan: options.model ?? options.provider,
      date: now.toISOString().slice(0, 10),
      kind: "model",
      ...(options.licenseType ? { type: options.licenseType } : {}),
      terms: options.licenseTerms,
      ...(options.licenseUrl ? { url: options.licenseUrl } : {}),
      generatedAt: report.generatedAt,
      rig: {
        source: options.rigSource ?? (rigged ? "unknown" : "none"),
        rigged,
        joints: report.summary.joints,
        animations: report.animations,
      },
    },
  };
  const manifestPath = assetsManifestPath(assetsRoot);
  await register(manifestPath, entry);
  return { outputPath, manifestPath, entry };
}

async function readOptimizeReport(reportPath: string): Promise<ModelOptimizeReport> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    throw new Error(`optimization report not found or invalid: ${reportPath}`);
  }
  const report = parsed as Partial<ModelOptimizeReport>;
  if (
    report.schemaVersion !== MODEL_OPTIMIZE_REPORT_VERSION ||
    !report.source?.path ||
    !report.source.sha256 ||
    !report.output?.sha256 ||
    !report.compression ||
    !report.summary ||
    !Array.isArray(report.animations) ||
    !report.generatedAt
  ) {
    throw new Error(`unsupported or incomplete optimization report: ${reportPath}`);
  }
  return report as ModelOptimizeReport;
}

async function verifyOptimizeReport(
  inputPath: string,
  reportPath: string,
  report: ModelOptimizeReport,
): Promise<string> {
  const output = await readFile(inputPath);
  if (sha256(output) !== report.output.sha256 || output.length !== report.output.bytes) {
    throw new Error(`optimized GLB no longer matches ${reportPath}`);
  }
  const sourcePath = resolve(dirname(reportPath), report.source.path);
  if (!existsSync(sourcePath)) throw new Error(`raw model source is missing: ${sourcePath}`);
  const source = await readFile(sourcePath);
  if (sha256(source) !== report.source.sha256 || source.length !== report.source.bytes) {
    throw new Error(`raw model source no longer matches ${reportPath}`);
  }
  return sourcePath;
}

function fileRecord(data: Buffer, path: string): ModelFileRecord {
  return { path, sha256: sha256(data), bytes: data.length };
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function relativeForReport(reportPath: string, filePath: string): string {
  return relative(dirname(reportPath), filePath).replaceAll("\\", "/") || ".";
}

function assertModelId(id: string): void {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id)) {
    throw new Error(
      `invalid model id ${JSON.stringify(id)}; use lowercase letters, digits, dots, dashes, or underscores`,
    );
  }
}

function requiredFlag(argv: string[], name: string): string {
  const value = flag(argv, name);
  if (!value || value.startsWith("--")) throw new Error(`--${name} <value> is required`);
  return value;
}

function printModelUsage(): void {
  console.error(
    "usage:\n" +
      "  assetgen model generate --id <id> --prompt <text> [generate flags] [--publish]\n" +
      "  assetgen model optimize --in <raw.glb> --out <runtime.glb> [--report <path>] [--ktx2] [--no-draco]\n" +
      "  assetgen model register --in <runtime.glb> --id <id> --provider <provider> --license <terms>\n" +
      "           [--model <model>] [--prompt <text>] [--game <slug>|shared] [--repo <path>]\n" +
      "           [--report <runtime.glb.optimize.json>] [--license-url <url>] [--license-type <type>]\n" +
      "           [--rig <source>]\n" +
      "\n" +
      "  model generate stages a draft unless --publish is explicitly passed.\n" +
      "  model register requires the trace report emitted by model optimize.",
  );
}
