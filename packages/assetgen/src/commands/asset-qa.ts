import {
  runAssetQaCheck,
  runAssetQaRepair,
  type AssetQaCheckReport,
  type AssetQaRepairReport,
  type AssetQaTargetReport,
} from "../asset-qa/index.ts";
import { flag, flagValues, has } from "./args.ts";

export async function runAssetQaCommand(argv: string[]): Promise<void> {
  const action = argv[0];
  const commandArgs = argv.slice(1);
  const manifestPath = flag(commandArgs, "manifest");
  if ((action !== "check" && action !== "repair") || !manifestPath || manifestPath.startsWith("--")) {
    console.error(usage());
    process.exit(1);
  }

  const options = {
    manifestPath,
    root: flag(commandArgs, "root"),
    targetIds: flagValues(commandArgs, "target"),
  };
  if (options.root?.startsWith("--")) {
    console.error("[asset-qa] --root requires a directory path");
    process.exit(1);
  }
  try {
    if (action === "check") {
      const report = await runAssetQaCheck(options);
      printCheckReport(report, has(commandArgs, "json"));
      if (!report.ok) process.exit(1);
      return;
    }
    const report = await runAssetQaRepair(options);
    printRepairReport(report, has(commandArgs, "json"));
    if (!report.ok) process.exit(1);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[asset-qa:${action}] ${detail}`);
    process.exit(1);
  }
}

function printCheckReport(report: AssetQaCheckReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  for (const target of report.targets) printTarget(target, "check");
  const failed = report.targets.filter((target) => !target.ok).length;
  if (failed > 0) {
    console.error(
      `[asset-qa:check] ${failed}/${report.targets.length} target(s) failed — run ` +
        "`assetgen asset-qa repair --manifest <manifest>` only after reviewing the declared mutations",
    );
  } else {
    console.log(`[asset-qa:check] all ${report.targets.length} target(s) passed`);
  }
}

function printRepairReport(report: AssetQaRepairReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  for (const target of report.targets) {
    const state = target.changed ? "wrote" : "unchanged";
    const cleanup = target.passes > 0
      ? `; rematted ${target.remattedPixels}, cleared ${target.clearedPixels}, ${target.passes} pass(es)`
      : "";
    console.log(
      `[asset-qa:repair] ${state} ${target.id} (${target.path}) — ${target.operations.join(" -> ")}${cleanup}`,
    );
    if (!target.validation.ok) printTarget(target.validation, "repair");
  }
  const failed = report.targets.filter((target) => !target.validation.ok).length;
  if (failed > 0) {
    console.error(`[asset-qa:repair] ${failed}/${report.targets.length} repaired target(s) still fail their declared checks`);
  } else {
    console.log(`[asset-qa:repair] all ${report.targets.length} repaired target(s) satisfy their declared checks`);
  }
}

function printTarget(target: AssetQaTargetReport, prefix: "check" | "repair"): void {
  if (target.ok && target.metrics) {
    const margins = target.metrics.alpha.margins ? JSON.stringify(target.metrics.alpha.margins) : "none";
    console.log(
      `[asset-qa:${prefix}] ok ${target.id} (${target.path}) — ${target.metrics.width}x${target.metrics.height}, ` +
        `margins=${margins}, border=${target.metrics.alpha.borderPixels}, ` +
        `dark-fringe=${target.metrics.alpha.darkFringePixels}, encoding=${target.metrics.webpEncoding}`,
    );
    return;
  }
  console.error(`[asset-qa:${prefix}] FAIL ${target.id} (${target.path})`);
  for (const diagnostic of target.diagnostics) console.error(`[asset-qa:${prefix}]   - ${diagnostic.code}: ${diagnostic.message}`);
}

function usage(): string {
  return [
    "Usage:",
    "  assetgen asset-qa check --manifest <asset-qa.json> [--root <dir>] [--target <id>] [--json]",
    "  assetgen asset-qa repair --manifest <asset-qa.json> [--root <dir>] [--target <id>] [--json]",
    "",
    "The check action is strictly read-only. The repair action applies only mutations declared in the manifest,",
    "writes atomically, skips byte-identical outputs, and re-runs every declared check after mutation.",
  ].join("\n");
}
