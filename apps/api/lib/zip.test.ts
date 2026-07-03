import assert from "node:assert/strict";
import { test } from "node:test";

import { crc32, makeZip } from "./zip";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("makeZip writes local headers, central directory, and file names", () => {
  const zip = makeZip([
    { name: "idle.webp", data: Buffer.from("idle") },
    { name: "run.webp", data: Buffer.from("run") },
  ]);

  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from("idle.webp")), true);
  assert.equal(zip.includes(Buffer.from("run.webp")), true);

  const eocdOffset = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocdOffset), 0x06054b50);
  assert.equal(zip.readUInt16LE(eocdOffset + 8), 2);
  assert.equal(zip.readUInt16LE(eocdOffset + 10), 2);
});
