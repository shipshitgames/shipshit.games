import { describe, expect, test } from "bun:test";

import { DOOM_RAMP } from "./pixelize.ts";
import {
  colorDistance,
  flatKeyBackgroundDirective,
  hexToRgb,
  KEY_SAFE_MIN_DISTANCE,
  nearestPaletteColor,
  rgbToHex,
  selectKeyColor,
  validateKeyColor,
} from "./key-color.ts";

// Bruised-purple/violet flyer palette — the winged-host case. Magenta sits ~95
// from #c020c0 (in palette), green ~239 (out of palette).
const VIOLET = ["#c020c0", "#a030b0", "#c1121f", "#e9e3d6", "#161214"];
// A faction that uses toxic green as a SUBJECT colour: green clashes (~48), so a
// blind green default is wrong and selection must fall through to another key.
const TOXIC_GREEN = ["#22ff22", "#5a9a18", "#2c5410", "#e9e3d6", "#161214"];

describe("hex <-> rgb", () => {
  test("round-trips 6-digit and expands 3-digit hex", () => {
    expect(hexToRgb("#00ff00")).toEqual([0, 255, 0]);
    expect(hexToRgb("0f0")).toEqual([0, 255, 0]);
    expect(rgbToHex([255, 0, 255])).toBe("#ff00ff");
    expect(rgbToHex(hexToRgb("#1A2B3C"))).toBe("#1a2b3c");
  });

  test("throws on malformed hex", () => {
    expect(() => hexToRgb("#xyz")).toThrow();
    expect(() => hexToRgb("#12")).toThrow();
  });
});

describe("colorDistance / nearestPaletteColor", () => {
  test("Euclidean distance", () => {
    expect(colorDistance([0, 0, 0], [0, 0, 0])).toBe(0);
    expect(colorDistance([0, 0, 0], [255, 0, 0])).toBe(255);
  });

  test("finds the closest swatch and its distance", () => {
    const near = nearestPaletteColor(hexToRgb("#ff00ff"), VIOLET);
    expect(near.hex).toBe("#c020c0");
    expect(Math.round(near.distance)).toBe(95);
  });

  test("empty palette yields no nearest colour", () => {
    expect(nearestPaletteColor([0, 255, 0], [])).toEqual({ hex: null, distance: Infinity });
  });

  test("malformed swatches are skipped rather than aborting selection", () => {
    // a stray bad entry must not crash or shadow the real nearest colour
    const near = nearestPaletteColor([0, 255, 0], ["#xyz", "#00ff00"]);
    expect(near.hex).toBe("#00ff00");
    expect(near.distance).toBe(0);
  });
});

describe("validateKeyColor", () => {
  test("magenta is unsafe against a violet subject; green is safe", () => {
    expect(validateKeyColor({ keyHex: "#ff00ff", palette: VIOLET }).ok).toBe(false);
    expect(validateKeyColor({ keyHex: "#00ff00", palette: VIOLET }).ok).toBe(true);
  });

  test("reason names the binding subject colour", () => {
    const v = validateKeyColor({ keyHex: "#ff00ff", palette: VIOLET });
    expect(v.nearestHex).toBe("#c020c0");
    expect(v.reason).toMatch(/#c020c0/);
    expect(v.minDistance).toBe(KEY_SAFE_MIN_DISTANCE);
  });

  test("honours a custom minDistance", () => {
    // green is 239 from the violet palette: safe at 110, unsafe at 300.
    expect(validateKeyColor({ keyHex: "#00ff00", palette: VIOLET, minDistance: 300 }).ok).toBe(false);
  });
});

describe("selectKeyColor", () => {
  test("violet subject -> green (default), with magenta recorded as rejected", () => {
    const sel = selectKeyColor({ palette: VIOLET });
    expect(sel.name).toBe("green");
    expect(sel.hex).toBe("#00ff00");
    expect(sel.safe).toBe(true);
    const magenta = sel.candidates.find((c) => c.name === "magenta");
    expect(magenta?.safe).toBe(false);
  });

  test("toxic-green subject -> avoids green, falls through to a safe key", () => {
    const sel = selectKeyColor({ palette: TOXIC_GREEN });
    expect(sel.name).not.toBe("green");
    expect(sel.safe).toBe(true);
    expect(sel.candidates.find((c) => c.name === "green")?.safe).toBe(false);
    expect(sel.reason).toMatch(/green/); // explains green was rejected
  });

  test("the studio DOOM ramp still defaults to green", () => {
    expect(selectKeyColor({ palette: DOOM_RAMP }).name).toBe("green");
  });

  test("an explicit unsafe --key is returned but flagged unsafe", () => {
    const sel = selectKeyColor({ palette: VIOLET, prefer: "#ff00ff" });
    expect(sel.hex).toBe("#ff00ff");
    expect(sel.safe).toBe(false);
    expect(sel.reason).toMatch(/requested/);
  });

  test("an explicit safe --key is honoured", () => {
    const sel = selectKeyColor({ palette: VIOLET, prefer: "#0000ff" });
    expect(sel.hex).toBe("#0000ff");
    expect(sel.safe).toBe(true);
  });

  test("a palette spanning every candidate yields no safe key (farthest, flagged)", () => {
    const sel = selectKeyColor({ palette: ["#00ff00", "#ff00ff", "#0000ff", "#00ffff"] });
    expect(sel.safe).toBe(false);
    expect(sel.reason).toMatch(/no key cleared/);
  });
});

describe("flatKeyBackgroundDirective", () => {
  test("instructs a flat solid key background and reserves the colour", () => {
    const d = flatKeyBackgroundDirective("#00ff00", "green");
    expect(d).toMatch(/flat solid green \(#00ff00\) background/);
    expect(d).toMatch(/no gradients/);
    expect(d).toMatch(/reserve #00ff00/);
  });
});
