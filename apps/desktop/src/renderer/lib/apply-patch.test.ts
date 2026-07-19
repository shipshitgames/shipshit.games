// applyPatch backs usePatchState. Its useState-like no-op bail-out is what keeps
// a NumField clamp that re-sets the current value (e.g. typing past a maxed
// field) from re-running downstream useMemo/effect identities — the regression
// that would otherwise wipe the Maps pane's written output on a no-op keystroke.
import { expect, test } from "bun:test";

import { applyPatch } from "./hooks";

test("a value-changing patch returns a new merged object", () => {
  const state = { rooms: 6, written: "map.ts" };
  const next = applyPatch(state, { rooms: 8 });
  expect(next).not.toBe(state);
  expect(next).toEqual({ rooms: 8, written: "map.ts" });
});

test("a no-op patch (same value) returns the SAME reference", () => {
  const state = { rooms: 64, written: "map.ts" };
  const next = applyPatch(state, { rooms: 64 });
  expect(next).toBe(state);
});

test("an empty patch returns the same reference", () => {
  const state = { a: 1 };
  expect(applyPatch(state, {})).toBe(state);
});

test("a function patch reads current state and still bails out on no-op", () => {
  const state = { count: 3, label: "x" };
  expect(applyPatch(state, (c) => ({ count: c.count }))).toBe(state);
  expect(applyPatch(state, (c) => ({ count: c.count + 1 }))).toEqual({ count: 4, label: "x" });
});

test("a new object of equal shape is still a change (Object.is by reference)", () => {
  const state = { inputs: { a: "1" } };
  const next = applyPatch(state, { inputs: { a: "1" } });
  expect(next).not.toBe(state);
});
