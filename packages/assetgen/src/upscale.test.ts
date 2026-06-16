import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFileSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  REALESRGAN_DEFAULT_BIN,
  REALESRGAN_DEFAULT_MODEL,
  maybeUpscale,
  normalizeScale,
  realesrganAvailable,
  resolveRealesrgan,
} from "./upscale.ts";
import type { UpscaleRunner } from "./upscale.ts";

const INPUT = Buffer.from("ORIGINAL-PROVIDER-PNG-BYTES");

// A runner that writes a distinct buffer to the -o output path and reports success.
function writingRunner(payload: Buffer): UpscaleRunner {
  return (_bin, args) => {
    const outPath = args[args.indexOf("-o") + 1]!;
    writeFileSync(outPath, payload);
    return { status: 0, stderr: "" };
  };
}

// A runner that records the argv it was handed (and still writes output so the
// happy path completes), so a test can assert on the exact subprocess arguments.
function capturingRunner(captured: { bin?: string; args?: string[] }, payload = Buffer.from("OUT")): UpscaleRunner {
  return (bin, args) => {
    captured.bin = bin;
    captured.args = args;
    const outPath = args[args.indexOf("-o") + 1]!;
    writeFileSync(outPath, payload);
    return { status: 0, stderr: "" };
  };
}

test("maybeUpscale is a no-op when the binary is unavailable", async () => {
  const result = await maybeUpscale(INPUT, { available: () => false });
  assert.equal(result.upscaled, false);
  assert.equal(result.data.equals(INPUT), true);
  assert.match(result.reason ?? "", /not installed/);
});

test("maybeUpscale runs and returns the upscaled bytes when available", async () => {
  const fake = Buffer.from("FAKE-UPSCALED-PNG");
  const result = await maybeUpscale(INPUT, {
    available: () => true,
    runner: writingRunner(fake),
  });
  assert.equal(result.upscaled, true);
  assert.equal(result.data.equals(fake), true);
  assert.equal(result.scale, 4);
  assert.equal(result.reason, undefined);
});

test("maybeUpscale honors scale 2 and threads it into the argv", async () => {
  const captured: { bin?: string; args?: string[] } = {};
  const result = await maybeUpscale(INPUT, {
    scale: 2,
    available: () => true,
    runner: capturingRunner(captured),
  });
  assert.equal(result.scale, 2);
  const args = captured.args!;
  const sIdx = args.indexOf("-s");
  assert.ok(sIdx >= 0, "argv must contain -s");
  assert.equal(args[sIdx + 1], "2");
});

test("normalizeScale snaps anything but 2 to 4", () => {
  assert.equal(normalizeScale(2), 2);
  assert.equal(normalizeScale("2"), 2);
  assert.equal(normalizeScale(3), 4);
  assert.equal(normalizeScale(99), 4);
  assert.equal(normalizeScale(undefined), 4);
});

test("maybeUpscale never throws when the runner throws", async () => {
  const result = await maybeUpscale(INPUT, {
    available: () => true,
    runner: () => {
      throw new Error("kaboom in runner");
    },
  });
  assert.equal(result.upscaled, false);
  assert.equal(result.data.equals(INPUT), true);
  assert.match(result.reason ?? "", /error/);
});

test("maybeUpscale no-ops on a non-zero exit and surfaces the code", async () => {
  const result = await maybeUpscale(INPUT, {
    available: () => true,
    runner: () => ({ status: 1, stderr: "boom" }),
  });
  assert.equal(result.upscaled, false);
  assert.equal(result.data.equals(INPUT), true);
  assert.ok((result.reason ?? "").includes("1"), `reason was ${result.reason}`);
});

test("maybeUpscale no-ops when the runner writes no output", async () => {
  const result = await maybeUpscale(INPUT, {
    available: () => true,
    runner: () => ({ status: 0, stderr: "" }),
  });
  assert.equal(result.upscaled, false);
  assert.equal(result.data.equals(INPUT), true);
  assert.match(result.reason ?? "", /no output/);
});

test("maybeUpscale no-ops when the runner writes a zero-byte file", async () => {
  // existsSync passes but the output is empty — a corrupt/aborted upscale must
  // not be fed downstream; treat it as "no output" and return the input.
  const result = await maybeUpscale(INPUT, {
    available: () => true,
    runner: writingRunner(Buffer.alloc(0)),
  });
  assert.equal(result.upscaled, false);
  assert.equal(result.data.equals(INPUT), true);
  assert.match(result.reason ?? "", /no output/);
});

test("maybeUpscale replaces an unsafe model with the default", async () => {
  const captured: { bin?: string; args?: string[] } = {};
  await maybeUpscale(INPUT, {
    model: "../../evil; rm -rf",
    available: () => true,
    runner: capturingRunner(captured),
  });
  const args = captured.args!;
  const nIdx = args.indexOf("-n");
  assert.ok(nIdx >= 0, "argv must contain -n");
  assert.equal(args[nIdx + 1], REALESRGAN_DEFAULT_MODEL);
});

test("maybeUpscale builds the exact default argv shape", async () => {
  const captured: { bin?: string; args?: string[] } = {};
  await maybeUpscale(INPUT, {
    available: () => true,
    runner: capturingRunner(captured),
  });
  const args = captured.args!;
  assert.equal(args.length, 8);
  assert.equal(args[0], "-i");
  assert.equal(typeof args[1], "string");
  assert.ok(args[1]!.length > 0 && args[1]!.endsWith(".png"), `in path was ${args[1]}`);
  assert.equal(args[2], "-o");
  assert.equal(typeof args[3], "string");
  assert.ok(args[3]!.length > 0 && args[3]!.endsWith(".png"), `out path was ${args[3]}`);
  assert.equal(args[4], "-s");
  assert.equal(args[5], "4");
  assert.equal(args[6], "-n");
  assert.equal(args[7], REALESRGAN_DEFAULT_MODEL);
});

test("realesrganAvailable probes an explicit path by existence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-upscale-avail-"));
  const present = join(dir, "realesrgan-ncnn-vulkan");
  await writeFile(present, "#!/bin/sh\n");
  try {
    // An explicit path that exists is "available"; a sibling that does not is not.
    assert.equal(realesrganAvailable(present), true);
    assert.equal(realesrganAvailable(join(dir, "does-not-exist")), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveRealesrgan honors REALESRGAN_BIN", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-upscale-bin-"));
  const binPath = join(dir, "realesrgan-ncnn-vulkan");
  await writeFile(binPath, "#!/bin/sh\n");
  const prev = process.env.REALESRGAN_BIN;
  try {
    process.env.REALESRGAN_BIN = binPath;
    assert.equal(resolveRealesrgan(), binPath);
  } finally {
    if (prev === undefined) delete process.env.REALESRGAN_BIN;
    else process.env.REALESRGAN_BIN = prev;
    await rm(dir, { recursive: true, force: true });
  }
});

test("module exposes the documented binary/model defaults", () => {
  assert.equal(REALESRGAN_DEFAULT_BIN, "realesrgan-ncnn-vulkan");
  assert.equal(REALESRGAN_DEFAULT_MODEL, "realesrgan-x4plus");
});
