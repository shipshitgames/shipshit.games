import { describe, expect, test } from "bun:test";

import { buildOptions, exitCodeForReport, numberOption, parseArgs, parseReadySpec, parseViewport } from "./cli.ts";

describe("parseArgs", () => {
  test("parses value flags, boolean flags, and ordered inline steps", () => {
    const args = parseArgs(["--url", "http://x", "--json", "--press", "Space,Enter", "--hold", "ArrowRight:200", "--shot", "mid"]);
    expect(args.values.get("url")).toBe("http://x");
    expect(args.flags.has("json")).toBe(true);
    expect(args.inlineSteps).toEqual([
      { type: "press", key: "Space" },
      { type: "press", key: "Enter" },
      { type: "hold", key: "ArrowRight", ms: 200 },
      { type: "screenshot", name: "mid" },
    ]);
  });

  test("supports --flag=value form", () => {
    expect(parseArgs(["--url=http://x"]).values.get("url")).toBe("http://x");
  });

  test("throws on unknown options (catches typos)", () => {
    expect(() => parseArgs(["--canvas-selector", "#scene"])).toThrow(/unknown option --canvas-selector/);
  });

  test("throws when a value flag has no value", () => {
    expect(() => parseArgs(["--url"])).toThrow(/missing value for --url/);
  });
});

describe("parseReadySpec", () => {
  test("resolves each mode", () => {
    expect(parseReadySpec("canvas", "#scene")).toEqual({ kind: "canvas", selector: "#scene" });
    expect(parseReadySpec("canvas:#foo", "#scene")).toEqual({ kind: "canvas", selector: "#foo" });
    expect(parseReadySpec("selector:.btn", "c")).toEqual({ kind: "selector", selector: ".btn" });
    expect(parseReadySpec("expr:window.ok", "c")).toEqual({ kind: "expression", expression: "window.ok" });
    expect(parseReadySpec("flag:__R__", "c")).toEqual({ kind: "flag", path: "__R__" });
  });
  test("rejects malformed or empty specs", () => {
    expect(() => parseReadySpec("nope", "c")).toThrow(/invalid --ready/);
    expect(() => parseReadySpec("selector:", "c")).toThrow(/invalid --ready/);
  });
});

describe("parseViewport", () => {
  test("parses WxH and trims", () => {
    expect(parseViewport(" 800x600 ")).toEqual({ width: 800, height: 600 });
  });
  test("rejects bad formats", () => {
    expect(() => parseViewport("bad")).toThrow(/invalid --viewport/);
    expect(() => parseViewport("800")).toThrow(/invalid --viewport/);
  });
});

describe("numberOption", () => {
  test("returns parsed value, fallback, and rejects negatives", () => {
    expect(numberOption(new Map([["observe", "250"]]), "observe", 2000)).toBe(250);
    expect(numberOption(new Map(), "observe", 2000)).toBe(2000);
    expect(() => numberOption(new Map([["observe", "-5"]]), "observe", 2000)).toThrow(/must be a number >= 0/);
  });
});

describe("exitCodeForReport", () => {
  test("maps a failed final report to a nonzero CLI exit", () => {
    expect(exitCodeForReport({ pass: true })).toBe(0);
    expect(exitCodeForReport({ pass: false })).toBe(1);
  });
});

describe("buildOptions", () => {
  test("applies sensible defaults", async () => {
    const opts = await buildOptions(parseArgs(["--url", "http://localhost:3000"]));
    expect(opts.url).toBe("http://localhost:3000");
    expect(opts.ready).toEqual({ kind: "canvas", selector: "canvas" });
    expect(opts.canvasSelector).toBe("canvas");
    expect(opts.checkBlank).toBe(true);
    expect(opts.viewport).toEqual({ width: 1280, height: 720 });
    expect(opts.clickTimeoutMs).toBe(5000);
    expect(opts.readyTimeoutMs).toBe(15000);
    expect(opts.script.steps).toEqual([]);
  });

  test("missing --url throws", async () => {
    await expect(buildOptions(parseArgs([]))).rejects.toThrow(/missing required --url/);
  });

  test("honors --canvas, --ready, --no-check-blank, and inline input", async () => {
    const opts = await buildOptions(
      parseArgs(["--url", "u", "--canvas", "#scene", "--ready", "flag:__GAME_READY__", "--no-check-blank", "--press", "Space", "--click-timeout", "1000"]),
    );
    expect(opts.canvasSelector).toBe("#scene");
    expect(opts.ready).toEqual({ kind: "flag", path: "__GAME_READY__" });
    expect(opts.checkBlank).toBe(false);
    expect(opts.clickTimeoutMs).toBe(1000);
    expect(opts.script.steps).toEqual([{ type: "press", key: "Space" }]);
  });

  test("--ready defaults its canvas selector to --canvas", async () => {
    const opts = await buildOptions(parseArgs(["--url", "u", "--canvas", "#game", "--ready", "canvas"]));
    expect(opts.ready).toEqual({ kind: "canvas", selector: "#game" });
  });
});
