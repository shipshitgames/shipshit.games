import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { maybeCutout, rembgAvailable, resolveRembg, REMBG_DEFAULT_BIN } from "./cutout.ts";

const temps: string[] = [];
function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assetgen-cutout-test-"));
  temps.push(root);
  return root;
}

const savedEnv = process.env.REMBG_BIN;
afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop()!, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env.REMBG_BIN;
  else process.env.REMBG_BIN = savedEnv;
});

test("resolveRembg honors the REMBG_BIN env override when it exists", () => {
  const root = tempRoot();
  const bin = path.join(root, "rembg");
  fs.writeFileSync(bin, "#!/bin/sh\n");
  process.env.REMBG_BIN = bin;
  expect(resolveRembg()).toBe(bin);
});

test("rembgAvailable is true for an existing path, false for a bare/missing name", () => {
  const root = tempRoot();
  const bin = path.join(root, "rembg");
  fs.writeFileSync(bin, "#!/bin/sh\n");
  expect(rembgAvailable(bin)).toBe(true);
  expect(rembgAvailable(path.join(root, "nope"))).toBe(false);
  // A bare default name means "not resolved to a real path" → not available.
  expect(rembgAvailable(REMBG_DEFAULT_BIN)).toBe(false);
});

test("maybeCutout no-ops (returns input unchanged) when rembg is unavailable", async () => {
  const input = Buffer.from("raw-image-bytes");
  const res = await maybeCutout(input, { available: () => false });
  expect(res.applied).toBe(false);
  expect(res.tool).toBe("rembg");
  expect(res.reason).toMatch(/not installed/);
  expect(res.data).toBe(input);
});

test("maybeCutout applies when the runner writes a non-empty output (fake rembg)", async () => {
  const input = Buffer.from("raw-image-bytes");
  const res = await maybeCutout(input, {
    binPath: "/fake/rembg",
    available: () => true,
    runner: (_bin, args) => {
      // args === ["i", <in>, <out>]; the real binary writes the cutout — fake it.
      const out = args[2]!;
      fs.writeFileSync(out, Buffer.from("cut-rgba-png"));
      return { status: 0, stderr: "" };
    },
  });
  expect(res.applied).toBe(true);
  expect(res.tool).toBe("rembg");
  expect(res.data.toString()).toBe("cut-rgba-png");
});

test("maybeCutout no-ops on a non-zero exit, surfacing the last stderr line", async () => {
  const res = await maybeCutout(Buffer.from("x"), {
    binPath: "/fake/rembg",
    available: () => true,
    runner: () => ({ status: 1, stderr: "boom\nfatal: model download failed" }),
  });
  expect(res.applied).toBe(false);
  expect(res.reason).toMatch(/exited 1/);
  expect(res.reason).toMatch(/model download failed/);
});

test("maybeCutout no-ops when the runner exits 0 but produces no output", async () => {
  const res = await maybeCutout(Buffer.from("x"), {
    binPath: "/fake/rembg",
    available: () => true,
    runner: () => ({ status: 0, stderr: "" }), // never writes the out file
  });
  expect(res.applied).toBe(false);
  expect(res.reason).toMatch(/no output/);
});

test("maybeCutout never throws — a runner that throws degrades to a no-op", async () => {
  const input = Buffer.from("x");
  const res = await maybeCutout(input, {
    binPath: "/fake/rembg",
    available: () => true,
    runner: () => {
      throw new Error("spawn exploded");
    },
  });
  expect(res.applied).toBe(false);
  expect(res.data).toBe(input);
  expect(res.reason).toMatch(/spawn exploded/);
});
