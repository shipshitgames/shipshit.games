import { describe, expect, test } from "bun:test";

import { parseHold, parseInputScript, parsePresses, parseScriptJson, sanitizeName, ScriptError } from "./script.ts";

describe("parseInputScript", () => {
  test("accepts the { steps } object form", () => {
    const script = parseInputScript({
      steps: [
        { type: "wait", ms: 100 },
        { type: "press", key: "Space" },
        { type: "hold", key: "ArrowRight", ms: 200 },
        { type: "tap", x: 10, y: 20 },
        { type: "click", selector: "#start" },
        { type: "screenshot", name: "mid frame" },
      ],
    });
    expect(script.steps).toHaveLength(6);
    expect(script.steps[5]).toEqual({ type: "screenshot", name: "mid-frame" });
  });

  test("accepts the bare array form", () => {
    const script = parseInputScript([{ type: "keydown", key: "w" }, { type: "keyup", key: "w" }]);
    expect(script.steps).toHaveLength(2);
  });

  test("rejects unknown step types", () => {
    expect(() => parseInputScript([{ type: "jump" }])).toThrow(ScriptError);
  });

  test("rejects missing required fields", () => {
    expect(() => parseInputScript([{ type: "press" }])).toThrow(/"key" must be a non-empty string/);
    expect(() => parseInputScript([{ type: "wait" }])).toThrow(/"ms" must be a finite number/);
  });

  test("rejects negative durations", () => {
    expect(() => parseInputScript([{ type: "wait", ms: -1 }])).toThrow(/">= 0"|>= 0/);
  });

  test("rejects non-array, non-object input", () => {
    expect(() => parseInputScript("nope")).toThrow(ScriptError);
  });
});

describe("parseScriptJson", () => {
  test("parses valid JSON", () => {
    expect(parseScriptJson('{"steps":[{"type":"press","key":"Enter"}]}').steps).toHaveLength(1);
  });
  test("throws a ScriptError on invalid JSON", () => {
    expect(() => parseScriptJson("{not json")).toThrow(ScriptError);
  });
});

describe("parsePresses", () => {
  test("splits, trims, and drops empties", () => {
    expect(parsePresses("ArrowUp, Space ,,KeyW")).toEqual([
      { type: "press", key: "ArrowUp" },
      { type: "press", key: "Space" },
      { type: "press", key: "KeyW" },
    ]);
  });
});

describe("parseHold", () => {
  test("parses <key>:<ms>", () => {
    expect(parseHold("ArrowRight:1200")).toEqual({ type: "hold", key: "ArrowRight", ms: 1200 });
  });
  test("rejects malformed specs", () => {
    expect(() => parseHold("ArrowRight")).toThrow(ScriptError);
    expect(() => parseHold("ArrowRight:")).toThrow(ScriptError);
    expect(() => parseHold(":500")).toThrow(ScriptError);
    expect(() => parseHold("ArrowRight:abc")).toThrow(ScriptError);
  });
});

describe("sanitizeName", () => {
  test("keeps safe characters and collapses the rest", () => {
    expect(sanitizeName("mid frame/01")).toBe("mid-frame-01");
    expect(sanitizeName("  ../weird**name  ")).toBe("weird-name");
    expect(sanitizeName("***")).toBe("screenshot");
  });
});
