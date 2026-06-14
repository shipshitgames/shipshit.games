import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { paletteToGpl } from "./palette.ts";
import { DOOM_RAMP } from "./pixelize.ts";

const DOOM_GPL = fileURLToPath(new URL("../../assets/palettes/doom.gpl", import.meta.url));

test("paletteToGpl emits a valid GIMP palette header and one swatch per color", () => {
  const gpl = paletteToGpl(["#000000", "#ff6a00"], "Test Ramp", 4);
  const lines = gpl.trimEnd().split("\n");
  assert.equal(lines[0], "GIMP Palette");
  assert.equal(lines[1], "Name: Test Ramp");
  assert.equal(lines[2], "Columns: 4");
  assert.equal(lines[3], "#");
  // "R G B<TAB>#hex", right-aligned RGB in 3-char columns.
  assert.equal(lines[4], "  0   0   0\t#000000");
  assert.equal(lines[5], "255 106   0\t#ff6a00");
  assert.equal(lines.length, 6);
});

test("packages/assets/palettes/doom.gpl is the DOOM_RAMP, not drifted (regenerate on change)", async () => {
  const onDisk = await readFile(DOOM_GPL, "utf8");
  const expected = paletteToGpl(DOOM_RAMP, "Deadrot DOOM");
  assert.equal(
    onDisk,
    expected,
    "doom.gpl is out of sync with DOOM_RAMP — regenerate it from packages/assetgen (see README palette section)",
  );
  // Every DOOM_RAMP color must appear as a swatch so Aseprite loads the full ramp.
  for (const hex of DOOM_RAMP) assert.ok(onDisk.includes(`\t${hex}`), `doom.gpl missing swatch ${hex}`);
});
