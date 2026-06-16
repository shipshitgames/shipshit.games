import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkTokenStaleness,
  compareSemver,
  DEFAULT_CONSUMER_FILES,
  failingResults,
  parseBannerVersion,
  parseDesignVersion,
  parseSemver,
} from "./token-staleness.ts";

const ASSETGEN_BANNER = "/* GENERATED FROM lore/DESIGN.md v1.2.3 hash:73277f2a - DO NOT EDIT. Run: bun assetgen tokens */\n";
const APP_CONSUMER_BANNER = "/* GENERATED FROM DESIGN.md v1.2.3 for app token consumers. DO NOT EDIT BY HAND. */\n";

function bannerFile(version: string): string {
  return `/* GENERATED FROM DESIGN.md v${version} for app token consumers. DO NOT EDIT BY HAND. */\n:root { --void: #0a0a0a; }\n`;
}

function design(version: string): string {
  return `---\nversion: "${version}"\nname: "Test"\ncolors:\n  primary: "#c1121f"\n---\n\n# Test\n`;
}

test("parseSemver accepts MAJOR.MINOR.PATCH with optional v prefix and suffix", () => {
  assert.deepEqual(parseSemver("0.1.0"), [0, 1, 0]);
  assert.deepEqual(parseSemver("v2.10.4"), [2, 10, 4]);
  assert.deepEqual(parseSemver("1.2.3-beta.1"), [1, 2, 3]);
  assert.deepEqual(parseSemver("  0.0.1  "), [0, 0, 1]);
});

test("parseSemver rejects non-semver input", () => {
  assert.equal(parseSemver("1.2"), null);
  assert.equal(parseSemver("latest"), null);
  assert.equal(parseSemver(""), null);
});

test("compareSemver orders versions field by field", () => {
  assert.equal(compareSemver([0, 1, 0], [0, 2, 0]), -1);
  assert.equal(compareSemver([0, 2, 0], [0, 1, 9]), 1);
  assert.equal(compareSemver([1, 0, 0], [1, 0, 0]), 0);
  assert.equal(compareSemver([1, 0, 0], [0, 9, 9]), 1);
  assert.equal(compareSemver([2, 0, 1], [2, 0, 2]), -1);
});

test("parseBannerVersion reads the version from both banner formats", () => {
  assert.equal(parseBannerVersion(ASSETGEN_BANNER), "1.2.3");
  assert.equal(parseBannerVersion(APP_CONSUMER_BANNER), "1.2.3");
  assert.equal(parseBannerVersion("/* GENERATED FROM DESIGN.md v0.4.0-rc.2 ... */"), "0.4.0-rc.2");
});

test("parseBannerVersion returns null when no banner version is present", () => {
  assert.equal(parseBannerVersion(":root { --void: #0a0a0a; }"), null);
  assert.equal(parseBannerVersion("/* hand-written css, no banner */"), null);
  // A version number that is not part of a GENERATED banner is ignored.
  assert.equal(parseBannerVersion("/* see v1.0.0 of the spec */ :root {}"), null);
});

test("parseDesignVersion reads the frontmatter version", () => {
  assert.equal(parseDesignVersion(design("3.4.5")), "3.4.5");
});

test("parseDesignVersion throws on missing frontmatter or version", () => {
  assert.throws(() => parseDesignVersion("# no frontmatter"), /no YAML frontmatter/);
  assert.throws(() => parseDesignVersion("---\nname: x\n---\n"), /version is missing or not semver/);
  assert.throws(() => parseDesignVersion("---\nversion: latest\n---\n"), /not semver/);
});

test("checkTokenStaleness flags a consumer behind canon as stale", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-"));
  const file = join(dir, "theme.css");
  await writeFile(file, bannerFile("0.1.0"));

  const report = await checkTokenStaleness({ canonVersion: "0.2.0", files: [file] });

  assert.equal(report.ok, false);
  assert.equal(report.canonVersion, "0.2.0");
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0]!.status, "stale");
  assert.equal(report.results[0]!.version, "0.1.0");
  assert.deepEqual(
    failingResults(report).map((r) => r.status),
    ["stale"],
  );
});

test("checkTokenStaleness passes a consumer that equals or leads canon", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-ok-"));
  const current = join(dir, "current.css");
  const ahead = join(dir, "ahead.css");
  await writeFile(current, bannerFile("0.2.0"));
  await writeFile(ahead, bannerFile("0.3.1"));

  const report = await checkTokenStaleness({ canonVersion: "0.2.0", files: [current, ahead] });

  assert.equal(report.ok, true);
  assert.equal(report.results[0]!.status, "current");
  assert.equal(report.results[1]!.status, "ahead");
  assert.deepEqual(failingResults(report), []);
});

test("checkTokenStaleness fails on a missing file or a banner-less file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-bad-"));
  const missing = join(dir, "does-not-exist.css");
  const noBanner = join(dir, "hand-edited.css");
  await writeFile(noBanner, ":root { --void: #0a0a0a; }\n");

  const report = await checkTokenStaleness({ canonVersion: "0.1.0", files: [missing, noBanner] });

  assert.equal(report.ok, false);
  assert.equal(report.results[0]!.status, "missing");
  assert.equal(report.results[1]!.status, "no-banner");
});

test("checkTokenStaleness resolves the canon version from a DESIGN.md path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-staleness-design-"));
  const designPath = join(dir, "DESIGN.md");
  const file = join(dir, "theme.css");
  await writeFile(designPath, design("5.0.0"));
  await writeFile(file, bannerFile("4.9.9"));

  const report = await checkTokenStaleness({ design: designPath, files: [file] });

  assert.equal(report.canonVersion, "5.0.0");
  assert.equal(report.ok, false);
  assert.equal(report.results[0]!.status, "stale");
});

test("checkTokenStaleness defaults to the committed app token consumers (all current)", async () => {
  // No files + no canon override: resolves the real DESIGN.md and the real
  // vendored consumers. The committed repo state must be current.
  const report = await checkTokenStaleness();

  assert.equal(report.results.length, DEFAULT_CONSUMER_FILES.length);
  assert.deepEqual(
    report.results.map((r) => r.file),
    [...DEFAULT_CONSUMER_FILES],
  );
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
});
