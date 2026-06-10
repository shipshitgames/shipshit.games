import { describe, expect, test } from "bun:test";

import { buildMarkdownReport, summarizeReport } from "./report.ts";
import type { GameTestReport } from "./types.ts";

function makeReport(overrides: Partial<GameTestReport> = {}): GameTestReport {
  return {
    url: "file:///game.html",
    startedAt: "2026-06-09T00:00:00.000Z",
    finishedAt: "2026-06-09T00:00:03.000Z",
    durationMs: 3000,
    ready: { ok: true, mode: "flag:__GAME_READY__", waitedMs: 120 },
    canvas: {
      found: true,
      selector: "#scene",
      width: 480,
      height: 320,
      stats: { sampleWidth: 48, sampleHeight: 48, fillRatio: 0.4, uniqueColors: 40, meanLuma: 30, variance: 12, blank: false },
    },
    steps: [{ index: 0, step: { type: "press", key: "Space" }, ok: true }],
    screenshots: [{ name: "final", path: "out/final.png", atMs: 2800 }],
    consoleErrors: [],
    pageErrors: [],
    pass: true,
    failures: [],
    ...overrides,
  };
}

describe("summarizeReport", () => {
  test("renders a PASS line", () => {
    expect(summarizeReport(makeReport())).toContain("[PASS]");
  });

  test("renders a FAIL line with reasons", () => {
    const line = summarizeReport(makeReport({ pass: false, failures: ["canvas rendered blank"] }));
    expect(line).toContain("[FAIL]");
    expect(line).toContain("canvas rendered blank");
  });
});

describe("buildMarkdownReport", () => {
  test("includes the verdict, url, steps, and screenshots", () => {
    const md = buildMarkdownReport(makeReport());
    expect(md).toContain("✅ PASS");
    expect(md).toContain("file:///game.html");
    expect(md).toContain("press Space");
    expect(md).toContain("final.png");
    expect(md).not.toContain("## Failures");
  });

  test("renders failures and page errors when present", () => {
    const md = buildMarkdownReport(
      makeReport({
        pass: false,
        failures: ["canvas rendered blank"],
        pageErrors: ["TypeError: boom"],
        canvas: { found: true, selector: "#scene", width: 480, height: 320, stats: { sampleWidth: 48, sampleHeight: 48, fillRatio: 0, uniqueColors: 1, meanLuma: 0, variance: 0, blank: true } },
      }),
    );
    expect(md).toContain("❌ FAIL");
    expect(md).toContain("## Failures");
    expect(md).toContain("canvas rendered blank");
    expect(md).toContain("## Page errors");
    expect(md).toContain("TypeError: boom");
    expect(md).toContain("blank=true");
  });
});
