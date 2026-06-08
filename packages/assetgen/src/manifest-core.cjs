// Canonical asset manifest writer + license validation (issue #17:
// "no generator may skip register").
//
// This is plain, dependency-free CommonJS on purpose: it is the SINGLE
// implementation shared by both runtimes that have to write the manifest:
//   - assetgen (bun-run TypeScript) via the typed facade in ./manifest.ts
//   - the Electron desktop main process (CommonJS) via require()
//
// Keep it free of non-builtin imports so every runtime can load it as-is, and
// do NOT fork this logic anywhere — the desktop used to ship a weaker copy that
// drifted (truthiness-only license checks). See manifest-core.d.cts for types
// and the parity tests in manifest.test.ts / apps/desktop.
const { readFile, writeFile, mkdir } = require("node:fs/promises");
const { dirname } = require("node:path");

/** Required provenance fields; every registered asset must carry all four. */
const REQUIRED_LICENSE_FIELDS = ["tool", "plan", "date", "kind"];

/** Throw unless the entry carries a complete, non-empty license record. */
function assertLicenseRecord(entry) {
  for (const field of REQUIRED_LICENSE_FIELDS) {
    const value = entry.license?.[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`asset manifest entry ${entry.id}:${entry.kind} requires license.${field}`);
    }
  }
}

/** Upsert an asset entry into a game's assets.json (single source of truth). */
async function register(manifestPath, entry) {
  assertLicenseRecord(entry);
  let data = { assets: [] };
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    if (Array.isArray(parsed.assets)) data = parsed;
  } catch {
    /* new manifest */
  }
  const i = data.assets.findIndex((a) => a.id === entry.id && a.kind === entry.kind);
  if (i >= 0) data.assets[i] = entry;
  else data.assets.push(entry);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(data, null, 2) + "\n");
}

module.exports = { register, assertLicenseRecord, REQUIRED_LICENSE_FIELDS };
