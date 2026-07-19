import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { generateRulesReport } from "./reports";

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "cli.ts");

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function seedReportLibrary(root: string): Promise<void> {
  await writeJson(join(root, "sources", "alpha", "source.json"), {
    schemaVersion: 1,
    slug: "alpha",
    kind: "youtube-channel",
    title: "Alpha Source",
    url: "https://example.com/alpha",
    priority: "primary",
    status: "active",
    topics: ["game-production", "testing"],
    rights: {
      transcriptPolicy: "public-captions",
      storeRawTranscript: false,
      notes: "Metadata-only fixture.",
    },
    desiredOutputs: ["rule"],
    notes: [],
  });
  await writeJson(join(root, "sources", "beta", "source.json"), {
    schemaVersion: 1,
    slug: "beta",
    kind: "article",
    title: "Beta Source",
    url: "https://example.com/beta",
    priority: "reference",
    status: "active",
    topics: ["rendering"],
    rights: {
      transcriptPolicy: "permissioned",
      storeRawTranscript: false,
      notes: "Metadata-only fixture.",
    },
    desiredOutputs: ["rule"],
    notes: [],
  });
  await writeJson(join(root, "transcripts", "alpha", "alpha-video.resource.json"), {
    schemaVersion: 1,
    slug: "alpha-video",
    sourceSlug: "alpha",
    sourceKind: "youtube-video",
    title: "Alpha Video",
    url: "https://example.com/alpha/video",
    capturedAt: "2026-01-01T00:00:00.000Z",
    transcriptPath: "transcripts/alpha/raw-transcript-that-does-not-exist.md",
    transcriptFormat: "markdown",
    rights: { status: "public-captions", notes: "Metadata-only fixture." },
    tags: ["testing"],
    derivatives: {
      skillCandidates: [],
      appCandidates: [],
      toolCandidates: [],
    },
  });
  await writeJson(
    join(root, "derivatives", "rules", "alpha-rule.resource.json"),
    {
      schemaVersion: 1,
      slug: "alpha-rule",
      kind: "rule",
      title: "Alpha Rule",
      status: "candidate",
      sourceTranscripts: [
        "transcripts/alpha/alpha-video.resource.json",
      ],
      outputPath: "derivatives/rules/alpha-rule.md",
      summary: "Original rule summary.",
      tags: ["automation", "testing"],
    },
  );
}

test("generateRulesReport summarizes rules by source, topic, and status", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-rules-report-"));
  try {
    await seedReportLibrary(root);
    const report = await generateRulesReport({
      sourcesDir: join(root, "sources"),
      transcriptsDir: join(root, "transcripts"),
      derivativesDir: join(root, "derivatives"),
      contentRoot: root,
    });

    assert.match(report, /^# Rules Report/m);
    assert.match(report, /Source coverage: 1\/2/);
    assert.match(report, /## By source/);
    assert.match(
      report,
      /\| alpha \| game-production, testing \| 1 \| 1 \| Alpha Rule \| candidate: 1 \|/,
    );
    assert.match(report, /\| beta \| rendering \| 0 \| 0 \| — \| — \|/);
    assert.match(report, /## By topic/);
    assert.match(report, /\| automation \| 1 \| Alpha Rule \| alpha \|/);
    assert.match(report, /## By status/);
    assert.match(report, /\| candidate \| 1 \| Alpha Rule \|/);
    assert.doesNotMatch(report, /raw-transcript-that-does-not-exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rules-report CLI writes compact Markdown for an alternate library root", async () => {
  const root = await mkdtemp(join(tmpdir(), "ressources-rules-report-cli-"));
  const output = join(root, "reports", "rules.md");
  try {
    await seedReportLibrary(root);
    const result = spawnSync(
      process.execPath,
      [cliPath, "rules-report", "--root", root, "--out", output],
      { encoding: "utf8", timeout: 60_000 },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[rules-report\]/);
    const report = await readFile(output, "utf8");
    assert.match(report, /# Rules Report/);
    assert.match(report, /Source coverage: 1\/2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
