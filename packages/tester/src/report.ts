// Report formatting. Pure: it renders whatever report object it is given, so the
// runner stamps timestamps/durations and this stays deterministic + testable.

import type { GameTestReport, InputStep } from "./types.ts";

function describeStep(step: InputStep): string {
  switch (step.type) {
    case "wait":
      return `wait ${step.ms}ms`;
    case "press":
      return `press ${step.key}`;
    case "keydown":
      return `keydown ${step.key}`;
    case "keyup":
      return `keyup ${step.key}`;
    case "hold":
      return `hold ${step.key} for ${step.ms}ms`;
    case "tap":
      return `tap (${step.x}, ${step.y})`;
    case "click":
      return `click ${step.selector}`;
    case "screenshot":
      return `screenshot ${step.name}`;
    default:
      return JSON.stringify(step);
  }
}

/** One-line verdict suitable for logs. */
export function summarizeReport(report: GameTestReport): string {
  const verdict = report.pass ? "PASS" : "FAIL";
  const blank = report.canvas.stats?.blank ? " blank-canvas" : "";
  const reasons = report.pass ? "" : ` — ${report.failures.join("; ")}`;
  return `[${verdict}] ${report.url} ready=${report.ready.ok} canvas=${report.canvas.found}${blank} (${report.durationMs}ms)${reasons}`;
}

/** Compact Markdown report aimed at agent review. */
export function buildMarkdownReport(report: GameTestReport): string {
  const lines: string[] = [];
  lines.push(`# Game test report`);
  lines.push("");
  lines.push(`- **Result:** ${report.pass ? "✅ PASS" : "❌ FAIL"}`);
  lines.push(`- **URL:** ${report.url}`);
  lines.push(`- **Started:** ${report.startedAt}`);
  lines.push(`- **Duration:** ${report.durationMs}ms`);
  lines.push(
    `- **Ready:** ${report.ready.ok ? "yes" : "no"} (${report.ready.mode}, waited ${report.ready.waitedMs}ms)` +
      (report.ready.error ? ` — ${report.ready.error}` : ""),
  );

  const canvas = report.canvas;
  if (canvas.found) {
    const stats = canvas.stats;
    const statText = stats
      ? `blank=${stats.blank}, fill=${stats.fillRatio.toFixed(4)}, colors=${stats.uniqueColors}, meanLuma=${stats.meanLuma.toFixed(1)}`
      : "not sampled";
    lines.push(`- **Canvas:** \`${canvas.selector}\` ${canvas.width}×${canvas.height} (${statText})`);
  } else {
    lines.push(`- **Canvas:** not found (\`${canvas.selector}\`)`);
  }

  if (!report.pass && report.failures.length > 0) {
    lines.push("");
    lines.push(`## Failures`);
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }

  lines.push("");
  lines.push(`## Steps`);
  if (report.steps.length === 0) {
    lines.push(`- (none)`);
  } else {
    for (const result of report.steps) {
      const mark = result.ok ? "✅" : "❌";
      const err = result.error ? ` — ${result.error}` : "";
      lines.push(`- ${mark} ${describeStep(result.step)}${err}`);
    }
  }

  lines.push("");
  lines.push(`## Screenshots`);
  if (report.screenshots.length === 0) {
    lines.push(`- (none)`);
  } else {
    for (const shot of report.screenshots) {
      lines.push(`- \`${shot.path}\` (${shot.name}, +${shot.atMs}ms)`);
    }
  }

  if (report.pageErrors.length > 0) {
    lines.push("");
    lines.push(`## Page errors`);
    for (const error of report.pageErrors) lines.push(`- ${error}`);
  }

  if (report.consoleErrors.length > 0) {
    lines.push("");
    lines.push(`## Console errors`);
    for (const error of report.consoleErrors) lines.push(`- ${error}`);
  }

  lines.push("");
  return lines.join("\n");
}
