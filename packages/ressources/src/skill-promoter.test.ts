import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promoteSkill } from "./skill-promoter";

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "cli.ts");

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

async function writeFixture(root: string, overrides: Record<string, unknown> = {}): Promise<string> {
  await writeJson(join(root, "sources", "fixture-source", "source.json"), {
    schemaVersion: 1,
    slug: "fixture-source",
    kind: "article",
    title: "Fixture Source",
    url: "https://example.com/source",
    priority: "reference",
    status: "active",
    topics: ["testing"],
    rights: {
      transcriptPolicy: "user-provided",
      storeRawTranscript: true,
      notes: "Fixture rights.",
    },
    desiredOutputs: ["skill"],
    notes: ["Fixture source."],
  });
  const transcriptPath = "transcripts/fixture-source/fixture.transcript.md";
  await writeText(join(root, transcriptPath), "RAW TRANSCRIPT SENTINEL MUST NEVER BE PROMOTED\n");
  await writeJson(join(root, "transcripts", "fixture-source", "fixture.resource.json"), {
    schemaVersion: 1,
    slug: "fixture",
    sourceSlug: "fixture-source",
    sourceKind: "article",
    title: "Fixture Transcript",
    url: "https://example.com/source",
    capturedAt: "2026-01-01T00:00:00.000Z",
    transcriptPath,
    transcriptFormat: "plain-text",
    rights: { status: "user-provided", notes: "Fixture rights." },
    tags: ["testing"],
    derivatives: { skillCandidates: ["fixture-skill"], appCandidates: [], toolCandidates: [] },
  });
  await writeText(
    join(root, "derivatives", "rules", "fixture-rule.md"),
    "# Fixture Rule\n\nOriginal distilled guidance.\n",
  );
  await writeJson(join(root, "derivatives", "rules", "fixture-rule.resource.json"), {
    schemaVersion: 1,
    slug: "fixture-rule",
    kind: "rule",
    title: "Fixture Rule",
    status: "active",
    sourceTranscripts: ["transcripts/fixture-source/fixture.resource.json"],
    outputPath: "derivatives/rules/fixture-rule.md",
    summary: "Original distilled fixture guidance.",
    tags: ["testing"],
  });
  await writeText(
    join(root, "derivatives", "skills", "fixture-skill.md"),
    [
      "# Fixture Skill",
      "",
      "## Trigger",
      "",
      "Use this skill when a fixture needs promotion.",
      "",
      "## Workflow",
      "",
      "1. Read the fixture.",
      "2. Produce the result.",
      "",
      "## Inputs",
      "",
      "- A fixture.",
      "",
      "## Outputs",
      "",
      "- A promoted result.",
      "",
      "## Promotion Checklist",
      "",
      "- Confirm the fixture result.",
      "",
    ].join("\n"),
  );
  const manifestPath = join(root, "derivatives", "skills", "fixture-skill.resource.json");
  await writeJson(manifestPath, {
    schemaVersion: 1,
    slug: "fixture-skill",
    kind: "skill",
    title: "Fixture Skill",
    status: "candidate",
    sourceTranscripts: ["transcripts/fixture-source/fixture.resource.json"],
    sourceRules: ["derivatives/rules/fixture-rule.resource.json"],
    outputPath: "derivatives/skills/fixture-skill.md",
    summary: "Promote a reviewed fixture into a repeatable workflow.",
    tags: ["testing"],
    ...overrides,
  });
  return manifestPath;
}

test("dry-run renders a reviewable skill diff without writing or copying transcript text", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-dry-"));
  const skillsRoot = join(root, "skills");
  try {
    const candidateManifestPath = await writeFixture(root);
    const result = await promoteSkill({
      candidateManifestPath,
      libraryRoot: root,
      skillsRoot,
      dryRun: true,
    });

    assert.equal(result.changed, true);
    assert.equal(result.wrote, false);
    assert.match(result.diff, /--- \/dev\/null/);
    assert.match(result.diff, /@@ -0,0 \+1,\d+ @@/);
    assert.match(result.content, /## Trigger Rules/);
    assert.match(result.content, /## Workflow/);
    assert.match(result.content, /## Inputs/);
    assert.match(result.content, /## Outputs/);
    assert.match(result.content, /## Verification/);
    assert.match(result.content, /## Review Gate/);
    assert.match(result.content, /fixture-rule\.resource\.json/);
    assert.doesNotMatch(result.content, /RAW TRANSCRIPT SENTINEL/);
    await assert.rejects(readFile(result.targetPath, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approved promotion creates and updates the skill folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-write-"));
  const skillsRoot = join(root, "skills");
  try {
    const candidateManifestPath = await writeFixture(root);
    const created = await promoteSkill({
      candidateManifestPath,
      libraryRoot: root,
      skillsRoot,
      approve: true,
    });
    assert.equal(created.wrote, true);
    assert.equal(await readFile(created.targetPath, "utf8"), created.content);

    const candidatePath = join(root, "derivatives", "skills", "fixture-skill.md");
    await writeFile(
      candidatePath,
      (await readFile(candidatePath, "utf8")).replace(
        "Use this skill when a fixture needs promotion.",
        "Use this skill when an updated fixture needs promotion.",
      ),
      "utf8",
    );
    const updated = await promoteSkill({
      candidateManifestPath,
      libraryRoot: root,
      skillsRoot,
      approve: true,
    });
    assert.equal(updated.wrote, true);
    assert.match(updated.diff, /^--- a\//);
    assert.doesNotMatch(updated.diff, /-name: fixture-skill/);
    assert.match(await readFile(updated.targetPath, "utf8"), /updated fixture/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("promotion refuses candidates without provenance or explicit approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-gate-"));
  try {
    const candidateManifestPath = await writeFixture(root, {
      sourceTranscripts: [],
      sourceRules: [],
    });
    await assert.rejects(
      promoteSkill({ candidateManifestPath, libraryRoot: root, skillsRoot: join(root, "skills"), dryRun: true }),
      /at least one source transcript or distilled rule/,
    );
    await assert.rejects(
      promoteSkill({
        candidateManifestPath,
        libraryRoot: root,
        skillsRoot: join(root, "skills"),
      }),
      /refusing to write without --approve/,
    );
    await assert.rejects(
      promoteSkill({
        candidateManifestPath,
        libraryRoot: root,
        skillsRoot: join(root, "skills"),
        dryRun: true,
        approve: true,
      }),
      /mutually exclusive/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("promotion rejects escaping references and raw transcript candidate sections", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-safe-"));
  try {
    const escapingManifest = await writeFixture(root, {
      sourceTranscripts: ["transcripts/../../outside.resource.json"],
      sourceRules: [],
    });
    await assert.rejects(
      promoteSkill({
        candidateManifestPath: escapingManifest,
        libraryRoot: root,
        skillsRoot: join(root, "skills"),
        dryRun: true,
      }),
      /escapes the ressources library/,
    );

    const candidateManifestPath = await writeFixture(root);
    await writeFile(
      join(root, "derivatives", "skills", "fixture-skill.md"),
      "# Fixture Skill\n\n## Raw Transcript\n\nDo not promote this.\n",
      "utf8",
    );
    await assert.rejects(
      promoteSkill({
        candidateManifestPath,
        libraryRoot: root,
        skillsRoot: join(root, "skills"),
        dryRun: true,
      }),
      /raw transcript section/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("promotion rejects missing reviewed sections and a symlinked SKILL.md target", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-target-"));
  const skillsRoot = join(root, "skills");
  try {
    const candidateManifestPath = await writeFixture(root);
    await writeFile(
      join(root, "derivatives", "skills", "fixture-skill.md"),
      "# Fixture Skill\n\n## Trigger\n\nUse for fixtures.\n",
      "utf8",
    );
    await assert.rejects(
      promoteSkill({ candidateManifestPath, libraryRoot: root, skillsRoot, dryRun: true }),
      /missing a reviewed Workflow section/,
    );

    await writeFixture(root);
    const outside = join(root, "outside.md");
    await writeFile(outside, "do not overwrite\n", "utf8");
    const targetDir = join(skillsRoot, "fixture-skill");
    await mkdir(targetDir, { recursive: true });
    await symlink(outside, join(targetDir, "SKILL.md"));
    await assert.rejects(
      promoteSkill({ candidateManifestPath, libraryRoot: root, skillsRoot, approve: true }),
      /must not be a symbolic link/,
    );
    assert.equal(await readFile(outside, "utf8"), "do not overwrite\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("promotion rejects a freshly scaffolded pending-review candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-pending-"));
  try {
    const candidateManifestPath = await writeFixture(root);
    const candidatePath = join(root, "derivatives", "skills", "fixture-skill.md");
    await writeFile(
      candidatePath,
      `${await readFile(candidatePath, "utf8")}\n## Implementation Notes\n\n- Pending review.\n`,
      "utf8",
    );
    await assert.rejects(
      promoteSkill({
        candidateManifestPath,
        libraryRoot: root,
        skillsRoot: join(root, "skills"),
        dryRun: true,
      }),
      /pending-review placeholder/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow extraction preserves fenced content containing markdown headings", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-fence-"));
  try {
    const candidateManifestPath = await writeFixture(root);
    const candidatePath = join(root, "derivatives", "skills", "fixture-skill.md");
    const candidate = await readFile(candidatePath, "utf8");
    await writeFile(
      candidatePath,
      candidate.replace(
        "1. Read the fixture.\n2. Produce the result.",
        [
          "1. Read the fixture.",
          "2. Preserve this example:",
          "",
          "```markdown",
          "## This is fenced content, not a section",
          "```",
          "",
          "3. Produce the result.",
        ].join("\n"),
      ),
      "utf8",
    );
    const result = await promoteSkill({
      candidateManifestPath,
      libraryRoot: root,
      skillsRoot: join(root, "skills"),
      dryRun: true,
    });
    assert.match(result.content, /## This is fenced content, not a section/);
    assert.match(result.content, /3\. Produce the result\./);
    assert.match(result.content, /```markdown[\s\S]*```/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a rules-only candidate validates and promotes without transcript provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-rule-only-"));
  try {
    const candidateManifestPath = await writeFixture(root, {
      sourceTranscripts: [],
      sourceRules: ["derivatives/rules/fixture-rule.resource.json"],
    });
    const result = await promoteSkill({
      candidateManifestPath,
      libraryRoot: root,
      skillsRoot: join(root, "skills"),
      dryRun: true,
    });
    assert.match(result.content, /fixture-rule\.resource\.json/);
    assert.doesNotMatch(result.content, /fixture\.resource\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: promote-skill CLI writes a validated fixture after approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-promoter-cli-"));
  const skillsRoot = join(root, "skills");
  try {
    const candidateManifestPath = await writeFixture(root);
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "promote-skill",
        "--candidate",
        candidateManifestPath,
        "--root",
        root,
        "--skills-root",
        skillsRoot,
        "--approve",
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[skill-promoted\]/);
    assert.match(
      await readFile(join(skillsRoot, "fixture-skill", "SKILL.md"), "utf8"),
      /# Fixture Skill/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
