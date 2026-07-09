import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeReports } from "./report-files.ts";
import type { GameTestReport } from "./types.ts";

function makeReport(): GameTestReport {
  return {
    url: "file:///game.html",
    startedAt: "2026-07-09T00:00:00.000Z",
    finishedAt: "2026-07-09T00:00:01.000Z",
    durationMs: 1000,
    ready: { ok: true, mode: "canvas:#scene", waitedMs: 10 },
    canvas: { found: true, selector: "#scene", width: 480, height: 320 },
    steps: [],
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    pass: true,
    failures: [],
  };
}

describe("writeReports", () => {
  test("creates parent directories for custom JSON and Markdown paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "tester-reports-"));
    try {
      const report = makeReport();
      const reportJsonPath = join(root, "custom", "json", "result.json");
      const reportMarkdownPath = join(root, "custom", "markdown", "result.md");

      await writeReports(report, { reportJsonPath, reportMarkdownPath });

      expect(JSON.parse(await readFile(reportJsonPath, "utf8"))).toEqual(report);
      expect(await readFile(reportMarkdownPath, "utf8")).toContain("✅ PASS");
      expect(report.pass).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("makes the final report fail when the JSON report cannot be written", async () => {
    const root = await mkdtemp(join(tmpdir(), "tester-reports-"));
    try {
      const report = makeReport();
      const reportJsonPath = join(root, "report.json");
      const reportMarkdownPath = join(root, "nested", "report.md");
      await mkdir(reportJsonPath);

      await writeReports(report, { reportJsonPath, reportMarkdownPath });

      expect(report.pass).toBe(false);
      expect(report.failures).toHaveLength(1);
      expect(report.failures[0]).toContain("writing JSON report failed");
      expect(report.pageErrors).toEqual([]);
      const markdown = await readFile(reportMarkdownPath, "utf8");
      expect(markdown).toContain("❌ FAIL");
      expect(markdown).toContain("writing JSON report failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("emits final JSON state when the Markdown report cannot be written", async () => {
    const root = await mkdtemp(join(tmpdir(), "tester-reports-"));
    try {
      const report = makeReport();
      const reportJsonPath = join(root, "nested", "report.json");
      const reportMarkdownPath = join(root, "report.md");
      await mkdir(reportMarkdownPath);

      await writeReports(report, { reportJsonPath, reportMarkdownPath });

      expect(report.pass).toBe(false);
      expect(report.failures).toHaveLength(1);
      expect(report.failures[0]).toContain("writing Markdown report failed");
      expect(report.pageErrors).toEqual([]);
      expect(JSON.parse(await readFile(reportJsonPath, "utf8"))).toEqual(report);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
