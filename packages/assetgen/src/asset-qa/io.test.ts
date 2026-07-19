import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, test } from "bun:test";

import { decodePamRgba, encodePamRgba, webpEncodingKind, withTemporaryDirectory } from "./io.ts";

describe("asset QA image I/O primitives", () => {
  test("PAM RGBA encode/decode is byte-exact", () => {
    const source = {
      width: 2,
      height: 2,
      data: Buffer.from([
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16,
      ]),
    };
    const encoded = encodePamRgba(source);
    assert.match(encoded.subarray(0, 80).toString("ascii"), /^P7\nWIDTH 2\nHEIGHT 2\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n/);
    assert.deepEqual(decodePamRgba(encoded), source);
  });

  test("PAM decode rejects truncated rasters with actionable dimensions", () => {
    assert.throws(
      () => decodePamRgba(Buffer.from("P7\nWIDTH 2\nHEIGHT 2\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n1234")),
      /raster is 4 bytes; expected 16/,
    );
  });

  test("detects lossless, lossy, and malformed WebP containers", () => {
    const lossless = Buffer.alloc(24);
    lossless.write("RIFF", 0, "ascii");
    lossless.write("WEBP", 8, "ascii");
    lossless.write("VP8L", 12, "ascii");
    lossless.writeUInt32LE(4, 16);
    assert.equal(webpEncodingKind(lossless), "lossless");

    const lossy = Buffer.from(lossless);
    lossy.write("VP8 ", 12, "ascii");
    assert.equal(webpEncodingKind(lossy), "lossy");
    assert.equal(webpEncodingKind(Buffer.from("not a webp")), "unknown");
  });

  test("temporary directories are removed on success and failure", async () => {
    let successfulDirectory = "";
    await withTemporaryDirectory("asset-qa-io-test-", async (directory) => {
      successfulDirectory = directory;
      assert.equal(existsSync(directory), true);
    });
    assert.equal(existsSync(successfulDirectory), false);

    let failedDirectory = "";
    await assert.rejects(
      withTemporaryDirectory("asset-qa-io-test-", async (directory) => {
        failedDirectory = directory;
        throw new Error("expected test failure");
      }),
      /expected test failure/,
    );
    assert.equal(existsSync(failedDirectory), false);
  });
});
