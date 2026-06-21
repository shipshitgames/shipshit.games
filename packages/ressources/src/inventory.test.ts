import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatDerivativesTable,
  formatSourcesTable,
  formatTranscriptsTable,
  inventoryDerivatives,
  inventorySources,
  inventoryTranscripts,
} from "./inventory";

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "cli.ts");

function optionsFor(root: string) {
  return {
    sourcesDir: join(root, "sources"),
    transcriptsDir: join(root, "transcripts"),
    derivativesDir: join(root, "derivatives"),
    contentRoot: root,
  };
}

function conformantSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: "fixture-source",
    kind: "article",
    title: "Fixture Source",
    url: "https://example.com",
    priority: "reference",
    status: "active",
    topics: ["testing", "tooling"],
    rights: { transcriptPolicy: "user-provided", storeRawTranscript: true, notes: "Fixture rights." },
    desiredOutputs: ["rule", "skill"],
    notes: ["Fixture note."],
    ...overrides,
  };
}

function conformantTranscript(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: "fixture-transcript",
    sourceSlug: "fixture-source",
    sourceKind: "youtube-video",
    title: "Fixture Transcript",
    url: "https://example.com/v",
    capturedAt: "2026-01-01T00:00:00.000Z",
    transcriptPath: "transcripts/fixture-source/fixture-transcript.transcript.md",
    transcriptFormat: "markdown",
    rights: { status: "user-provided", notes: "Fixture rights." },
    tags: ["alpha"],
    derivatives: { skillCandidates: ["skill-a"], appCandidates: [], toolCandidates: ["tool-a"] },
    ...overrides,
  };
}

function conformantDerivative(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: "fixture-derivative",
    kind: "rule",
    title: "Fixture Derivative",
    status: "candidate",
    sourceTranscripts: ["transcripts/fixture-source/fixture-transcript.resource.json"],
    outputPath: "derivatives/rules/fixture-derivative.md",
    summary: "Fixture summary.",
    tags: ["alpha"],
    ...overrides,
  };
}

async function writeSource(root: string, slug: string, source: unknown): Promise<void> {
  const dir = join(root, "sources", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "source.json"), JSON.stringify(source, null, 2), "utf8");
}

async function writeTranscript(root: string, sourceSlug: string, slug: string, resource: unknown): Promise<void> {
  const dir = join(root, "transcripts", sourceSlug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${slug}.resource.json`), JSON.stringify(resource, null, 2), "utf8");
}

async function writeDerivative(root: string, kindDir: string, slug: string, manifest: unknown): Promise<void> {
  const dir = join(root, "derivatives", kindDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${slug}.resource.json`), JSON.stringify(manifest, null, 2), "utf8");
}

async function writeRaw(root: string, relativePath: string, text: string): Promise<void> {
  const file = join(root, relativePath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------

test("inventorySources: empty library lists nothing and reports no errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-src-empty-"));
  try {
    const inventory = await inventorySources(optionsFor(root));
    assert.equal(inventory.kind, "sources");
    assert.equal(inventory.count, 0);
    assert.deepEqual(inventory.items, []);
    assert.deepEqual(inventory.errors, []);
    assert.equal(formatSourcesTable(inventory), "(no sources)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventorySources: seeded library projects desktop-renderable fields and a transcript count", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-src-seed-"));
  try {
    await writeSource(root, "fixture-source", conformantSource());
    await writeTranscript(root, "fixture-source", "one", conformantTranscript({ slug: "one" }));
    await writeTranscript(root, "fixture-source", "two", conformantTranscript({ slug: "two" }));

    const inventory = await inventorySources(optionsFor(root));
    assert.deepEqual(inventory.errors, []);
    assert.equal(inventory.count, 1);
    const [item] = inventory.items;
    assert.ok(item);
    assert.equal(item.slug, "fixture-source");
    assert.equal(item.kind, "article");
    assert.equal(item.priority, "reference");
    assert.equal(item.status, "active");
    assert.equal(item.transcriptPolicy, "user-provided");
    assert.equal(item.storeRawTranscript, true);
    assert.deepEqual(item.topics, ["testing", "tooling"]);
    assert.deepEqual(item.desiredOutputs, ["rule", "skill"]);
    assert.equal(item.transcriptCount, 2);
    assert.equal(item.path, "sources/fixture-source/source.json");

    const table = formatSourcesTable(inventory);
    assert.match(table, /SLUG/);
    assert.match(table, /TRANSCRIPTS/);
    assert.match(table, /fixture-source/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventorySources: a malformed record is reported and skipped while valid records still list", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-src-bad-"));
  try {
    await writeSource(root, "good", conformantSource({ slug: "good" }));
    await writeRaw(root, "sources/broken/source.json", "{ not valid json ");

    const inventory = await inventorySources(optionsFor(root));
    assert.equal(inventory.count, 1);
    assert.equal(inventory.items[0]?.slug, "good");
    assert.equal(inventory.errors.length >= 1, true);
    assert.match(inventory.errors.join("\n"), /sources\/broken\/source\.json: invalid JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventorySources: a schema-invalid record is flagged as a blocking error", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-src-schema-"));
  try {
    await writeSource(root, "bad", conformantSource({ slug: "bad", kind: "podcast" }));
    const inventory = await inventorySources(optionsFor(root));
    assert.equal(inventory.errors.length >= 1, true);
    assert.match(inventory.errors.join("\n"), /\.kind must be one of/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventorySources: items are sorted by path for stable output", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-src-sort-"));
  try {
    await writeSource(root, "zzz", conformantSource({ slug: "zzz" }));
    await writeSource(root, "aaa", conformantSource({ slug: "aaa" }));
    const inventory = await inventorySources(optionsFor(root));
    assert.deepEqual(
      inventory.items.map((item) => item.path),
      ["sources/aaa/source.json", "sources/zzz/source.json"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// transcripts
// ---------------------------------------------------------------------------

test("inventoryTranscripts: empty library lists nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-tx-empty-"));
  try {
    const inventory = await inventoryTranscripts(optionsFor(root));
    assert.equal(inventory.count, 0);
    assert.deepEqual(inventory.errors, []);
    assert.equal(formatTranscriptsTable(inventory), "(no transcripts)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventoryTranscripts: seeded library projects fields and a derivative-candidate count", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-tx-seed-"));
  try {
    await writeTranscript(root, "fixture-source", "fixture-transcript", conformantTranscript());
    const inventory = await inventoryTranscripts(optionsFor(root));
    assert.deepEqual(inventory.errors, []);
    assert.equal(inventory.count, 1);
    const [item] = inventory.items;
    assert.ok(item);
    assert.equal(item.slug, "fixture-transcript");
    assert.equal(item.sourceSlug, "fixture-source");
    assert.equal(item.sourceKind, "youtube-video");
    assert.equal(item.rightsStatus, "user-provided");
    assert.equal(item.transcriptFormat, "markdown");
    assert.equal(item.derivativeCount, 2); // one skill + one tool candidate
    assert.deepEqual(item.tags, ["alpha"]);
    assert.equal(item.path, "transcripts/fixture-source/fixture-transcript.resource.json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventoryTranscripts: a malformed record is reported and skipped", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-tx-bad-"));
  try {
    await writeTranscript(root, "fixture-source", "good", conformantTranscript({ slug: "good" }));
    await writeRaw(root, "transcripts/fixture-source/broken.resource.json", "not json at all");
    const inventory = await inventoryTranscripts(optionsFor(root));
    assert.equal(inventory.count, 1);
    assert.equal(inventory.items[0]?.slug, "good");
    assert.match(inventory.errors.join("\n"), /broken\.resource\.json: invalid JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventoryTranscripts: a schema-invalid record is flagged as a blocking error", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-tx-schema-"));
  try {
    // `sourceKind` is not in the schema enum; the record blocks but still lists.
    await writeTranscript(root, "fixture-source", "bad", conformantTranscript({ slug: "bad", sourceKind: "podcast" }));
    const inventory = await inventoryTranscripts(optionsFor(root));
    assert.equal(inventory.errors.length >= 1, true);
    assert.match(inventory.errors.join("\n"), /\.sourceKind must be one of/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventoryTranscripts: items are sorted by path for stable output", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-tx-sort-"));
  try {
    await writeTranscript(root, "fixture-source", "zzz", conformantTranscript({ slug: "zzz" }));
    await writeTranscript(root, "fixture-source", "aaa", conformantTranscript({ slug: "aaa" }));
    const inventory = await inventoryTranscripts(optionsFor(root));
    assert.deepEqual(
      inventory.items.map((item) => item.path),
      [
        "transcripts/fixture-source/aaa.resource.json",
        "transcripts/fixture-source/zzz.resource.json",
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// derivatives
// ---------------------------------------------------------------------------

test("inventoryDerivatives: empty library lists nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-dv-empty-"));
  try {
    const inventory = await inventoryDerivatives(optionsFor(root));
    assert.equal(inventory.count, 0);
    assert.deepEqual(inventory.errors, []);
    assert.equal(formatDerivativesTable(inventory), "(no derivatives)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventoryDerivatives: seeded library projects fields and a source-transcript count", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-dv-seed-"));
  try {
    await writeDerivative(root, "rules", "fixture-derivative", conformantDerivative());
    const inventory = await inventoryDerivatives(optionsFor(root));
    assert.deepEqual(inventory.errors, []);
    assert.equal(inventory.count, 1);
    const [item] = inventory.items;
    assert.ok(item);
    assert.equal(item.slug, "fixture-derivative");
    assert.equal(item.kind, "rule");
    assert.equal(item.status, "candidate");
    assert.equal(item.summary, "Fixture summary.");
    assert.equal(item.sourceTranscriptCount, 1);
    assert.equal(item.outputPath, "derivatives/rules/fixture-derivative.md");
    assert.equal(item.path, "derivatives/rules/fixture-derivative.resource.json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventoryDerivatives: a schema-invalid record is flagged as a blocking error", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-dv-schema-"));
  try {
    // `status` is not in the schema enum; the record still projects but blocks.
    await writeDerivative(root, "rules", "bad", conformantDerivative({ slug: "bad", status: "shipped" }));
    const inventory = await inventoryDerivatives(optionsFor(root));
    assert.equal(inventory.errors.length >= 1, true);
    assert.match(inventory.errors.join("\n"), /\.status must be one of/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inventoryDerivatives: items are sorted by path for stable output", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-dv-sort-"));
  try {
    await writeDerivative(root, "rules", "zzz", conformantDerivative({ slug: "zzz" }));
    await writeDerivative(root, "rules", "aaa", conformantDerivative({ slug: "aaa" }));
    const inventory = await inventoryDerivatives(optionsFor(root));
    assert.deepEqual(
      inventory.items.map((item) => item.path),
      ["derivatives/rules/aaa.resource.json", "derivatives/rules/zzz.resource.json"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// e2e: drive the CLI exactly as a human or the desktop app would
// ---------------------------------------------------------------------------

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8", timeout: 60_000 });
}

test("e2e: the checked-in library inventories exit 0 with stable JSON for every command", () => {
  for (const command of ["sources", "transcripts", "derivatives"] as const) {
    const result = runCli([command, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as { kind: string; count: number; items: unknown[]; errors: string[] };
    assert.equal(parsed.kind, command);
    assert.equal(Array.isArray(parsed.items), true);
    assert.equal(parsed.count, parsed.items.length);
    assert.deepEqual(parsed.errors, []);
  }
});

test("e2e: the sources table renders for the checked-in library", () => {
  const result = runCli(["sources"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SLUG\s+KIND\s+PRIORITY\s+STATUS\s+TRANSCRIPTS\s+TITLE/);
});

test("e2e: an empty --root library exits 0 with an empty-state table", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-cli-empty-"));
  try {
    const result = runCli(["sources", "--root", root]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\(no sources\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: a seeded --root library lists records as JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-cli-seed-"));
  try {
    await writeSource(root, "fixture-source", conformantSource());
    await writeTranscript(root, "fixture-source", "fixture-transcript", conformantTranscript());
    const result = runCli(["transcripts", "--json", "--root", root]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as { count: number; items: { sourceSlug: string }[] };
    assert.equal(parsed.count, 1);
    assert.equal(parsed.items[0]?.sourceSlug, "fixture-source");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: a malformed record makes the command exit non-zero and report the error", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-cli-bad-"));
  try {
    await writeSource(root, "good", conformantSource({ slug: "good" }));
    await writeRaw(root, "sources/broken/source.json", "{ broken ");

    // table mode: error on stderr, non-zero exit
    const table = runCli(["sources", "--root", root]);
    assert.equal(table.status, 1);
    assert.match(table.stderr, /\[error\] sources\/broken\/source\.json: invalid JSON/);

    // json mode: error captured in the JSON document on stdout, non-zero exit
    const json = runCli(["sources", "--json", "--root", root]);
    assert.equal(json.status, 1);
    const parsed = JSON.parse(json.stdout) as { errors: string[]; items: unknown[] };
    assert.equal(parsed.errors.length >= 1, true);
    assert.equal(parsed.items.length, 1); // the valid record still lists
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: every command exits non-zero on a malformed record, in both table and JSON modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-cli-bad-all-"));
  try {
    // One broken file per command's scanned directory.
    await writeRaw(root, "sources/broken/source.json", "{ broken ");
    await writeRaw(root, "transcripts/fixture-source/broken.resource.json", "{ broken ");
    await writeRaw(root, "derivatives/rules/broken.resource.json", "{ broken ");

    for (const command of ["sources", "transcripts", "derivatives"] as const) {
      const table = runCli([command, "--root", root]);
      assert.equal(table.status, 1, `${command} table mode should exit 1`);
      assert.match(table.stderr, /\[error\] .*broken.*invalid JSON/);

      const json = runCli([command, "--json", "--root", root]);
      assert.equal(json.status, 1, `${command} json mode should exit 1`);
      const parsed = JSON.parse(json.stdout) as { errors: string[] };
      assert.equal(parsed.errors.length >= 1, true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: a schema-invalid record causes a non-zero exit at the CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "inv-cli-schema-"));
  try {
    await writeDerivative(root, "rules", "bad", conformantDerivative({ slug: "bad", kind: "macro" }));

    const table = runCli(["derivatives", "--root", root]);
    assert.equal(table.status, 1);
    assert.match(table.stderr, /\[error\] .*\.kind must be one of/);

    const json = runCli(["derivatives", "--json", "--root", root]);
    assert.equal(json.status, 1);
    const parsed = JSON.parse(json.stdout) as { errors: string[]; items: unknown[] };
    assert.match(parsed.errors.join("\n"), /\.kind must be one of/);
    assert.equal(parsed.items.length, 1); // still projected for the desktop list
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: the transcripts and derivatives tables render headers for the checked-in library", () => {
  const transcripts = runCli(["transcripts"]);
  assert.equal(transcripts.status, 0, transcripts.stderr);
  assert.match(transcripts.stdout, /SLUG\s+SOURCE\s+RIGHTS\s+DERIVATIVES\s+TITLE/);

  const derivatives = runCli(["derivatives"]);
  assert.equal(derivatives.status, 0, derivatives.stderr);
  assert.match(derivatives.stdout, /SLUG\s+KIND\s+STATUS\s+SOURCES\s+TITLE/);
});
