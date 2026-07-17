import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { distillSource } from "./distill-flow";
import { validateLibrary } from "./library";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = resolve(packageDir, "src", "cli.ts");
const schemasDir = resolve(packageDir, "schemas");

function sourceManifest(storeRawTranscript = true) {
  return {
    schemaVersion: 1,
    slug: "fixture-source",
    kind: "youtube-channel",
    title: "Fixture Source",
    url: "https://www.youtube.com/@fixture",
    priority: "reference",
    status: "active",
    topics: ["testing", "game-production"],
    rights: {
      transcriptPolicy: "user-provided",
      storeRawTranscript,
      notes: storeRawTranscript
        ? "Store reviewed, rights-cleared transcript text."
        : "Store links and original derivatives only.",
    },
    desiredOutputs: ["rule"],
    notes: ["Fixture source."],
  };
}

async function fixtureRoot(storeRawTranscript = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ressources-distill-flow-"));
  const sourceDir = join(root, "sources", "fixture-source");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "source.json"),
    `${JSON.stringify(sourceManifest(storeRawTranscript), null, 2)}\n`,
    "utf8",
  );
  return root;
}

function validationOptions(root: string) {
  return {
    sourcesDir: join(root, "sources"),
    transcriptsDir: join(root, "transcripts"),
    derivativesDir: join(root, "derivatives"),
    contentRoot: root,
    schemasDir,
  };
}

test("source-aware distill writes transcript/rules records and validates as one library", async () => {
  const root = await fixtureRoot();
  const transcriptPath = join(root, "transcripts", "fixture-source", "fixture-video.transcript.md");
  try {
    const result = await distillSource({
      root,
      sourceSlug: "fixture-source",
      transcript: "A practical tutorial transcript.",
      title: "Fixture Video",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      slug: "fixture-video",
      provider: "mock",
      rightsStatus: "user-provided",
      outTranscriptPath: transcriptPath,
      duplicatePolicy: "skip",
    });

    assert.equal(result.status, "created");
    assert.equal(result.slug, "fixture-video");
    assert.equal(result.transcriptResource?.transcriptPath, "transcripts/fixture-source/fixture-video.transcript.md");
    assert.equal(result.transcriptResource?.derivatives.rulesPath, "derivatives/rules/fixture-video.md");
    assert.deepEqual(result.derivativeManifest?.sourceTranscripts, [
      "transcripts/fixture-source/fixture-video.resource.json",
    ]);
    assert.match(await readFile(transcriptPath, "utf8"), /A practical tutorial transcript/);
    assert.match(await readFile(result.rulesPath, "utf8"), /Mock distillation/);

    const validation = await validateLibrary(validationOptions(root));
    assert.equal(validation.ok, true, validation.errors.join("\n"));
    assert.deepEqual(validation.errors, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("distill records metadata without storing raw text when --out-transcript is omitted", async () => {
  const root = await fixtureRoot(false);
  try {
    const result = await distillSource({
      root,
      sourceSlug: "fixture-source",
      transcript: "Use this text to generate original rules, but do not retain it.",
      title: "No Raw Storage",
      slug: "no-raw-storage",
      provider: "mock",
      rightsStatus: "permissioned",
    });

    assert.equal(result.transcriptPath, undefined);
    assert.equal(result.transcriptResource?.transcriptPath, undefined);
    assert.equal(result.transcriptResource?.transcriptFormat, undefined);
    const sidecar = JSON.parse(await readFile(result.transcriptSidecarPath, "utf8")) as Record<string, unknown>;
    assert.equal("transcriptPath" in sidecar, false);

    const validation = await validateLibrary(validationOptions(root));
    assert.equal(validation.ok, true, validation.errors.join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a pre-created transcript resource is updated in place instead of skipped", async () => {
  const root = await fixtureRoot();
  const transcriptDir = join(root, "transcripts", "fixture-source");
  const transcriptPath = join(transcriptDir, "prepared.transcript.md");
  const sidecarPath = join(transcriptDir, "prepared.resource.json");
  await mkdir(transcriptDir, { recursive: true });
  await writeFile(transcriptPath, "Prepared transcript text.\n", "utf8");
  await writeFile(
    sidecarPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        slug: "prepared",
        sourceSlug: "fixture-source",
        sourceKind: "youtube-video",
        title: "Prepared Transcript",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        capturedAt: "2026-01-01T00:00:00.000Z",
        transcriptPath: "transcripts/fixture-source/prepared.transcript.md",
        transcriptFormat: "markdown",
        rights: {
          status: "permissioned",
          notes: "Human-reviewed rights note.",
        },
        tags: ["testing"],
        derivatives: {
          skillCandidates: ["prepared-skill"],
          appCandidates: [],
          toolCandidates: [],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  try {
    const skipped = await distillSource({
      root,
      sourceSlug: "fixture-source",
      transcript: "This must not replace the prepared transcript.",
      title: "Prepared Transcript",
      slug: "prepared",
      provider: "mock",
      rightsStatus: "permissioned",
      outTranscriptPath: transcriptPath,
      duplicatePolicy: "skip",
    });

    assert.equal(skipped.status, "skipped");
    assert.equal(await readFile(transcriptPath, "utf8"), "Prepared transcript text.\n");
    await assert.rejects(
      readFile(join(root, "derivatives", "rules", "prepared.md"), "utf8"),
      /ENOENT/,
    );

    const result = await distillSource({
      root,
      sourceSlug: "fixture-source",
      transcript: await readFile(transcriptPath, "utf8"),
      title: "Prepared Transcript",
      slug: "prepared",
      provider: "mock",
      rightsStatus: "public-captions",
      rightsExplicit: false,
    });

    assert.equal(result.status, "updated");
    assert.match(await readFile(result.rulesPath, "utf8"), /Mock distillation/);
    assert.equal(result.transcriptResource?.capturedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(
      result.transcriptResource?.url,
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    assert.equal(result.transcriptResource?.sourceKind, "youtube-video");
    assert.equal(result.transcriptResource?.rights.status, "permissioned");
    assert.equal(result.transcriptResource?.rights.notes, "Human-reviewed rights note.");
    assert.deepEqual(result.transcriptResource?.derivatives.skillCandidates, ["prepared-skill"]);
    assert.equal(
      result.transcriptResource?.transcriptPath,
      "transcripts/fixture-source/prepared.transcript.md",
    );

    const validation = await validateLibrary(validationOptions(root));
    assert.equal(validation.ok, true, validation.errors.join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("raw transcript storage is rejected before any artifacts are written when source rights forbid it", async () => {
  const root = await fixtureRoot(false);
  const transcriptPath = join(root, "transcripts", "fixture-source", "blocked.transcript.md");
  try {
    await assert.rejects(
      distillSource({
        root,
        sourceSlug: "fixture-source",
        transcript: "This raw text must not be stored.",
        title: "Blocked",
        slug: "blocked",
        provider: "mock",
        rightsStatus: "permissioned",
        outTranscriptPath: transcriptPath,
      }),
      /does not permit storing this raw transcript/,
    );
    await assert.rejects(readFile(transcriptPath, "utf8"), /ENOENT/);
    await assert.rejects(
      readFile(join(root, "derivatives", "rules", "blocked.md"), "utf8"),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unknown sources and unreviewed rights fail before distillation", async () => {
  const root = await fixtureRoot();
  try {
    await assert.rejects(
      distillSource({
        root,
        sourceSlug: "missing-source",
        transcript: "No source record exists.",
        title: "Missing",
        provider: "mock",
        rightsStatus: "user-provided",
      }),
      /unknown source: missing-source/,
    );
    await assert.rejects(
      distillSource({
        root,
        sourceSlug: "fixture-source",
        transcript: "Rights are not reviewed.",
        title: "Unknown Rights",
        slug: "unknown-rights",
        provider: "mock",
        rightsStatus: "unknown",
        outTranscriptPath: join(
          root,
          "transcripts",
          "fixture-source",
          "unknown-rights.transcript.md",
        ),
      }),
      /does not permit storing this raw transcript/,
    );
    await assert.rejects(
      distillSource({
        root,
        sourceSlug: "fixture-source",
        transcript: "Do not overwrite another library artifact.",
        title: "Unsafe Path",
        provider: "mock",
        rightsStatus: "user-provided",
        outTranscriptPath: join(root, "sources", "fixture-source", "source.json"),
      }),
      /must be a \*\.transcript\.md file inside transcripts\/fixture-source/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("duplicate policies skip, overwrite, and create deterministic versioned records", async () => {
  const root = await fixtureRoot();
  const transcriptPath = join(root, "transcripts", "fixture-source", "duplicate.transcript.md");
  const base = {
    root,
    sourceSlug: "fixture-source",
    title: "Duplicate",
    slug: "duplicate",
    provider: "mock",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    rightsStatus: "user-provided" as const,
    outTranscriptPath: transcriptPath,
  };
  try {
    const created = await distillSource({
      ...base,
      transcript: "First transcript.",
      duplicatePolicy: "skip",
    });
    const originalRules = await readFile(created.rulesPath, "utf8");

    const skipped = await distillSource({
      ...base,
      transcript: "This must not replace the first transcript.",
      duplicatePolicy: "skip",
    });
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.transcriptPath, undefined);
    assert.equal(await readFile(created.rulesPath, "utf8"), originalRules);

    const curatedSidecar = JSON.parse(
      await readFile(created.transcriptSidecarPath, "utf8"),
    ) as {
      tags: string[];
      rights: { notes: string };
      derivatives: { skillCandidates: string[] };
    };
    curatedSidecar.tags = ["curated-tag"];
    curatedSidecar.rights.notes = "Curated rights note.";
    curatedSidecar.derivatives.skillCandidates = ["curated-skill"];
    await writeFile(
      created.transcriptSidecarPath,
      `${JSON.stringify(curatedSidecar, null, 2)}\n`,
      "utf8",
    );

    await assert.rejects(
      distillSource({
        ...base,
        transcript: "Replacement transcript with more words.",
        outTranscriptPath: undefined,
        duplicatePolicy: "overwrite",
      }),
      /incoming transcript differs.*pass the same path with --out-transcript/,
    );

    const overwritten = await distillSource({
      ...base,
      transcript: "Replacement transcript with more words.",
      duplicatePolicy: "overwrite",
    });
    assert.equal(overwritten.status, "overwritten");
    assert.match(await readFile(transcriptPath, "utf8"), /Replacement transcript/);
    assert.equal(
      overwritten.transcriptResource?.transcriptPath,
      "transcripts/fixture-source/duplicate.transcript.md",
    );
    assert.equal(overwritten.transcriptResource?.rights.notes, "Curated rights note.");
    assert.deepEqual(overwritten.transcriptResource?.tags, ["curated-tag"]);
    assert.deepEqual(overwritten.transcriptResource?.derivatives.skillCandidates, [
      "curated-skill",
    ]);

    const versioned = await distillSource({
      ...base,
      transcript: "A separately reviewable revision.",
      url: undefined,
      duplicatePolicy: "versioned",
    });
    assert.equal(versioned.status, "versioned");
    assert.equal(versioned.slug, "duplicate-v2");
    assert.equal(
      versioned.transcriptResource?.url,
      overwritten.transcriptResource?.url,
    );
    assert.equal(
      versioned.transcriptResource?.sourceKind,
      overwritten.transcriptResource?.sourceKind,
    );
    assert.match(versioned.transcriptPath ?? "", /duplicate-v2\.transcript\.md$/);
    assert.match(await readFile(versioned.rulesPath, "utf8"), /Mock distillation/);

    const validation = await validateLibrary(validationOptions(root));
    assert.equal(validation.ok, true, validation.errors.join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI resolves --source and emits the complete source-aware record set", async () => {
  const root = await fixtureRoot();
  const inputPath = join(root, "input.txt");
  const transcriptPath = join(root, "transcripts", "fixture-source", "cli-flow.transcript.md");
  await writeFile(inputPath, "CLI fixture transcript.", "utf8");
  try {
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "distill",
        "--root",
        root,
        "--source",
        "fixture-source",
        "--transcript-file",
        inputPath,
        "--title",
        "CLI Flow",
        "--url",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "--slug",
        "cli-flow",
        "--provider",
        "mock",
        "--rights",
        "user-provided",
        "--out-transcript",
        transcriptPath,
        "--duplicate",
        "skip",
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[distill-created\]/);
    assert.match(await readFile(join(root, "derivatives", "rules", "cli-flow.md"), "utf8"), /CLI Flow/);
    assert.match(
      await readFile(join(root, "transcripts", "fixture-source", "cli-flow.resource.json"), "utf8"),
      /cli-flow/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI requires explicit rights before storing raw transcript text", async () => {
  const root = await fixtureRoot();
  const inputPath = join(root, "input.txt");
  const transcriptPath = join(root, "transcripts", "fixture-source", "missing-rights.transcript.md");
  await writeFile(inputPath, "CLI fixture transcript.", "utf8");
  try {
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "distill",
        "--root",
        root,
        "--source",
        "fixture-source",
        "--transcript-file",
        inputPath,
        "--title",
        "Missing Rights",
        "--url",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "--provider",
        "mock",
        "--out-transcript",
        transcriptPath,
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires explicit --rights with --out-transcript/);
    await assert.rejects(readFile(transcriptPath, "utf8"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI rejects invalid source-aware flags before reading or fetching transcript content", async () => {
  const root = await fixtureRoot();
  const missingInput = join(root, "does-not-exist.txt");
  try {
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "distill",
        "--root",
        root,
        "--source",
        "fixture-source",
        "--transcript-file",
        missingInput,
        "--title",
        "Invalid Provider",
        "--url",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "--provider",
        "bogus",
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown provider: bogus/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy distill without --source still writes the requested rules file", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-legacy-distill-"));
  const inputPath = join(root, "input.txt");
  const outputPath = join(root, "rules.md");
  await writeFile(inputPath, "Legacy CLI transcript.", "utf8");
  try {
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "distill",
        "--transcript-file",
        inputPath,
        "--title",
        "Legacy Flow",
        "--provider",
        "mock",
        "--out",
        outputPath,
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(outputPath, "utf8"), /Legacy Flow/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
