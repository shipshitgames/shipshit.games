import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";

import { canStoreRawTranscript, validateLibrary } from "./library";
import type { SourceManifest, TranscriptResource } from "./types";

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "cli.ts");

function conformantSource(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: "fixture-source",
    kind: "article",
    title: "Fixture",
    url: "https://example.com",
    priority: "reference",
    status: "active",
    topics: ["testing"],
    rights: {
      transcriptPolicy: "user-provided",
      storeRawTranscript: false,
      notes: "Fixture rights.",
    },
    desiredOutputs: ["rule"],
    notes: ["Fixture note."],
  };
}

function optionsFor(root: string) {
  return {
    sourcesDir: join(root, "sources"),
    transcriptsDir: join(root, "transcripts"),
    derivativesDir: join(root, "derivatives"),
    contentRoot: root,
  };
}

async function writeSourceFile(root: string, slug: string, source: unknown): Promise<void> {
  const dir = join(root, "sources", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "source.json"), JSON.stringify(source, null, 2), "utf8");
}

async function writeFixtureLibrary(root: string, source: Record<string, unknown>): Promise<void> {
  await writeSourceFile(root, "fixture-source", source);
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
    tags: [],
    derivatives: { skillCandidates: [], appCandidates: [], toolCandidates: [] },
    ...overrides,
  };
}

async function writeTranscriptFixture(
  root: string,
  resource: Record<string, unknown>,
  opts: { withTranscriptFile?: boolean } = {},
): Promise<void> {
  const dir = join(root, "transcripts", String(resource.sourceSlug));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${String(resource.slug)}.resource.json`), JSON.stringify(resource, null, 2), "utf8");
  if (opts.withTranscriptFile && typeof resource.transcriptPath === "string") {
    const file = join(root, resource.transcriptPath);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "# Fixture transcript\n", "utf8");
  }
}

const allowedSource: Pick<SourceManifest, "rights"> = {
  rights: {
    transcriptPolicy: "user-provided",
    storeRawTranscript: true,
    notes: "Raw transcripts are only stored when user-provided or otherwise cleared.",
  },
};

const blockedSource: Pick<SourceManifest, "rights"> = {
  rights: {
    transcriptPolicy: "permissioned",
    storeRawTranscript: false,
    notes: "Link to the source and store only original distilled notes.",
  },
};

function transcript(status: TranscriptResource["rights"]["status"]): Pick<TranscriptResource, "rights"> {
  return {
    rights: {
      status,
      notes: "Rights reviewed for this transcript resource.",
    },
  };
}

test("raw transcript storage requires a source opt-in and known transcript rights", () => {
  assert.equal(canStoreRawTranscript(allowedSource, transcript("user-provided")), true);
  assert.equal(canStoreRawTranscript(allowedSource, transcript("permissioned")), true);
  assert.equal(canStoreRawTranscript(allowedSource, transcript("unknown")), false);
  assert.equal(canStoreRawTranscript(blockedSource, transcript("permissioned")), false);
});

test("the checked-in ressources library validates", async () => {
  const result = await validateLibrary();

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.sources > 0, true);
});

test("research remains only a compatibility alias for the ressources CLI", async () => {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    name: string;
    bin: Record<string, string>;
  };

  assert.equal(packageJson.name, "@shipshitgames/ressources");
  assert.equal(packageJson.bin.ressources, "./src/cli.ts");
  assert.equal(packageJson.bin.research, packageJson.bin.ressources);
});

test("a conformant fixture library validates against the published schemas", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-ok-"));
  try {
    await writeFixtureLibrary(root, conformantSource());
    const result = await validateLibrary({
      sourcesDir: join(root, "sources"),
      transcriptsDir: join(root, "transcripts"),
      derivativesDir: join(root, "derivatives"),
      contentRoot: root,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.counts.sources, 1);
    assert.equal(result.counts.transcripts, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schema-driven validation rejects manifests the published schema forbids", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-bad-"));
  try {
    await writeFixtureLibrary(root, {
      ...conformantSource(),
      schemaVersion: 2, // const: 1
      slug: "Invalid Slug", // pattern
      kind: "podcast", // enum
      bogusField: true, // additionalProperties: false
    });
    const result = await validateLibrary({
      sourcesDir: join(root, "sources"),
      transcriptsDir: join(root, "transcripts"),
      derivativesDir: join(root, "derivatives"),
      contentRoot: root,
    });
    assert.equal(result.ok, false);
    const joined = result.errors.join("\n");
    assert.match(joined, /must equal 1/);
    assert.match(joined, /must match pattern/);
    assert.match(joined, /\.kind must be one of/);
    assert.match(joined, /bogusField is not an allowed property/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: the validate CLI exits 0 on the real committed library", () => {
  const result = spawnSync(process.execPath, [cliPath, "validate"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[validate\] sources=\d+ transcripts=\d+ derivatives=\d+/);
});

test("e2e: the validate CLI exits 1 on a fixture library with a schema-invalid manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-cli-"));
  try {
    await writeFixtureLibrary(root, { ...conformantSource(), kind: "podcast" });
    const result = spawnSync(process.execPath, [cliPath, "validate", "--root", root], {
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.kind must be one of/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: the validate CLI exits 0 on a conformant --root library", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-cli-ok-"));
  try {
    await writeFixtureLibrary(root, conformantSource());
    const result = spawnSync(process.execPath, [cliPath, "validate", "--root", root], {
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[validate\] sources=1 transcripts=0 derivatives=0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// The referential / semantic rules below are the half of validateLibrary the
// schemas cannot express, so each needs its own negative-path coverage.

test("duplicate source slugs are flagged", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-dup-"));
  try {
    await writeSourceFile(root, "one", { ...conformantSource(), slug: "shared-slug" });
    await writeSourceFile(root, "two", { ...conformantSource(), slug: "shared-slug" });
    const result = await validateLibrary(optionsFor(root));
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("duplicate source slug: shared-slug"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a transcript referencing an unknown source is flagged", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-unknown-"));
  try {
    await writeTranscriptFixture(root, conformantTranscript({ sourceSlug: "nonexistent" }), {
      withTranscriptFile: true,
    });
    const result = await validateLibrary(optionsFor(root));
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /references unknown source nonexistent/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a transcript whose transcriptPath file is missing is flagged", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-nofile-"));
  try {
    await writeFixtureLibrary(root, conformantSource());
    await writeTranscriptFixture(root, conformantTranscript(), { withTranscriptFile: false });
    const result = await validateLibrary(optionsFor(root));
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /transcriptPath does not exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a derivative whose outputPath file is missing is flagged", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-noout-"));
  try {
    const dir = join(root, "derivatives", "rules");
    await mkdir(dir, { recursive: true });
    const manifest = {
      schemaVersion: 1,
      slug: "fixture-derivative",
      kind: "rule",
      title: "Fixture Derivative",
      status: "candidate",
      sourceTranscripts: [],
      outputPath: "derivatives/rules/missing.md",
      summary: "Fixture summary.",
      tags: [],
    };
    await writeFile(join(dir, "fixture-derivative.resource.json"), JSON.stringify(manifest, null, 2), "utf8");
    const result = await validateLibrary(optionsFor(root));
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /outputPath does not exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("storing a raw transcript a source forbids is flagged (canStoreRawTranscript integration)", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-raw-"));
  try {
    // conformantSource() forbids raw storage (storeRawTranscript: false); the
    // transcript file exists, so the cross-file rule must fire as an error.
    await writeFixtureLibrary(root, conformantSource());
    await writeTranscriptFixture(root, conformantTranscript(), { withTranscriptFile: true });
    const result = await validateLibrary(optionsFor(root));
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /stores raw transcript text, but/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a source allowing raw storage with an unknown transcript policy is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-policy-"));
  try {
    await writeFixtureLibrary(root, {
      ...conformantSource(),
      rights: { transcriptPolicy: "unknown", storeRawTranscript: true, notes: "Conflicting." },
    });
    const result = await validateLibrary(optionsFor(root));
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /cannot allow raw transcript storage with an unknown transcript policy/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a non-object manifest reports a clean schema error instead of crashing the run", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-null-"));
  try {
    await writeSourceFile(root, "broken", null);
    const result = await validateLibrary(optionsFor(root));
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /must be of type object \(got null\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a transcript with a non-string sourceSlug reports a schema error instead of crashing", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-badtype-"));
  try {
    await writeTranscriptFixture(root, conformantTranscript({ sourceSlug: 123 }), { withTranscriptFile: true });
    const result = await validateLibrary(optionsFor(root));
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /sourceSlug must be of type string/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a slug-valid source missing its rights object reports a schema error instead of crashing the run", async () => {
  // Regression: a source with a valid slug (so it lands in sourcesBySlug) but no
  // `rights` object, referenced by a transcript whose file exists, used to throw an
  // uncaught TypeError out of canStoreRawTranscript (dereferencing
  // source.rights.storeRawTranscript) — aborting the run and hiding the schema error.
  // The schema pass already flags the missing rights, so the cross-file raw-storage
  // rule must be skipped: the run surfaces a clean schema error and exits non-zero.
  const root = await mkdtemp(join(tmpdir(), "ressources-norights-"));
  try {
    const sourceMissingRights = conformantSource();
    delete sourceMissingRights.rights;
    await writeFixtureLibrary(root, sourceMissingRights);
    // Conformant transcript referencing the source, with its transcript file present —
    // the precondition (transcriptExists) that previously reached the crashing call site.
    await writeTranscriptFixture(root, conformantTranscript(), { withTranscriptFile: true });

    // Must not throw — this call crashed with an uncaught TypeError before the fix.
    const result = await validateLibrary(optionsFor(root));

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /\.rights is required/);
    // The cross-file rule is skipped when rights is malformed, so no spurious
    // "stores raw transcript text" error is layered on top of the schema error.
    assert.equal(
      result.errors.filter((error) => error.includes("stores raw transcript text")).length,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
