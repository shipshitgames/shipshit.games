import {
  runAssetQaCheck,
  runAssetQaRepair,
  type AssetQaCheckReport,
  type AssetQaRepairReport,
  type AssetQaRunOptions,
  type AssetQaTargetReport,
} from "../asset-qa/index.ts";

type AssetQaAction = "check" | "repair";

interface ParsedAssetQaArguments {
  action: AssetQaAction;
  json: boolean;
  options: AssetQaRunOptions;
}

export async function runAssetQaCommand(argv: string[]): Promise<void> {
  let parsed: ParsedAssetQaArguments;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[asset-qa] ${detail}`);
    process.exit(1);
  }
  const { action, json, options } = parsed;
  try {
    if (action === "check") {
      const report = await runAssetQaCheck(options);
      printCheckReport(report, json);
      if (!report.ok) process.exit(1);
      return;
    }
    const report = await runAssetQaRepair(options);
    printRepairReport(report, json);
    if (!report.ok) process.exit(1);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[asset-qa:${action}] ${detail}`);
    process.exit(1);
  }
}

function parseArguments(argv: string[]): ParsedAssetQaArguments {
  const action = argv[0];
  if (action !== "check" && action !== "repair") throw new Error(usage());

  let manifestPath: string | undefined;
  let root: string | undefined;
  let json = false;
  const targetIds: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--json") {
      if (json) throw new Error("--json may be declared only once");
      json = true;
      continue;
    }
    if (argument !== "--manifest" && argument !== "--root" && argument !== "--target") {
      throw new Error(`unknown argument: ${argument}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("-")) {
      const label = argument === "--target" ? "a target id" : argument === "--root" ? "a directory path" : "a manifest path";
      throw new Error(`${argument} requires ${label}`);
    }
    index += 1;
    if (argument === "--manifest") {
      if (manifestPath !== undefined) throw new Error("--manifest may be declared only once");
      manifestPath = value;
    } else if (argument === "--root") {
      if (root !== undefined) throw new Error("--root may be declared only once");
      root = value;
    } else {
      targetIds.push(value);
    }
  }
  if (manifestPath === undefined) throw new Error(usage());
  return { action, json, options: { manifestPath, root, targetIds } };
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
