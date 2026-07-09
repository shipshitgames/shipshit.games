import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { buildMarkdownReport } from "./report.ts";
import type { GameTestReport, TesterOptions } from "./types.ts";

export type ReportPaths = Pick<TesterOptions, "reportJsonPath" | "reportMarkdownPath">;

interface ReportTarget {
  label: "JSON" | "Markdown";
  path: string;
  render: (report: GameTestReport) => string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordFailure(
  report: GameTestReport,
  action: "creating the parent directory for" | "writing" | "refreshing",
  target: ReportTarget,
  error: unknown,
): void {
  report.failures.push(`${action} ${target.label} report failed (${target.path}): ${errorMessage(error)}`);
  report.pass = false;
}

async function ensureParent(report: GameTestReport, target: ReportTarget): Promise<boolean> {
  try {
    await mkdir(dirname(target.path), { recursive: true });
    return true;
  } catch (error) {
    recordFailure(report, "creating the parent directory for", target, error);
    return false;
  }
}

async function writeTarget(report: GameTestReport, target: ReportTarget): Promise<boolean> {
  try {
    await writeFile(target.path, target.render(report), "utf8");
    return true;
  } catch (error) {
    recordFailure(report, "writing", target, error);
    return false;
  }
}

/**
 * Persist both report formats without letting filesystem failures escape the
 * report verdict. Parent-directory checks happen before either report is
 * rendered, and a Markdown report written before a later JSON failure is
 * refreshed so every successfully emitted report reflects the final state.
 */
export async function writeReports(report: GameTestReport, paths: ReportPaths): Promise<void> {
  const markdown: ReportTarget = {
    label: "Markdown",
    path: paths.reportMarkdownPath,
    render: buildMarkdownReport,
  };
  const json: ReportTarget = {
    label: "JSON",
    path: paths.reportJsonPath,
    render: (value) => `${JSON.stringify(value, null, 2)}\n`,
  };

  // Discover directory failures before rendering either report so a writable
  // companion starts with the final failure verdict.
  const markdownReady = await ensureParent(report, markdown);
  const jsonReady = await ensureParent(report, json);

  const markdownWritten = markdownReady && (await writeTarget(report, markdown));
  const markdownRevision = report.failures.length;

  if (jsonReady) {
    await writeTarget(report, json);
  }

  if (markdownWritten && report.failures.length !== markdownRevision) {
    try {
      await writeFile(markdown.path, markdown.render(report), "utf8");
    } catch (error) {
      recordFailure(report, "refreshing", markdown, error);
      // Do not leave a known-stale PASS report behind if it cannot be refreshed.
      await rm(markdown.path, { force: true }).catch(() => {});
    }
  }
}
