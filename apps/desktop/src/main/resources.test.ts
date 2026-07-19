import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  fingerprintResourceFile,
  parseResourceInventory,
  parseResourceValidation,
  resolveResourceDerivativePath,
  resolveRealSkillCandidatePath,
  resolveSkillCandidatePath,
  SkillPromotionReviewGate,
} from "./resources";

test("parses the stable package inventory contract without transcript content", () => {
  const inventory = parseResourceInventory(
    "transcripts",
    JSON.stringify({
      schemaVersion: 1,
      kind: "transcripts",
      count: 1,
      items: [
        {
          slug: "fixture",
          sourceSlug: "source",
          rightsStatus: "permissioned",
          transcriptPath: "transcripts/source/fixture.transcript.md",
        },
      ],
      errors: [],
      warnings: ["review rights"],
    }),
  );

  expect(inventory.count).toBe(1);
  expect(inventory.items[0]?.rightsStatus).toBe("permissioned");
  expect(inventory.warnings).toEqual(["review rights"]);
  expect(inventory.items[0]).not.toHaveProperty("transcript");
});

test("rejects malformed or mismatched inventory JSON", () => {
  expect(() => parseResourceInventory("sources", "not json")).toThrow("invalid JSON");
  expect(() =>
    parseResourceInventory(
      "sources",
      JSON.stringify({ schemaVersion: 1, kind: "derivatives", count: 0, items: [], errors: [], warnings: [] }),
    ),
  ).toThrow("unsupported inventory contract");
});

test("normalizes renderer-required inventory fields", () => {
  const sources = parseResourceInventory(
    "sources",
    JSON.stringify({
      schemaVersion: 1,
      kind: "sources",
      items: [{ slug: "source", topics: null }],
      errors: [],
      warnings: [],
    }),
  );
  const derivatives = parseResourceInventory(
    "derivatives",
    JSON.stringify({
      schemaVersion: 1,
      kind: "derivatives",
      items: [{ slug: "candidate", kind: "skill", tags: null, sourceTranscripts: null }],
      errors: [],
      warnings: [],
    }),
  );

  expect(sources.items[0]?.topics).toEqual([]);
  expect(sources.items[0]?.desiredOutputs).toEqual([]);
  expect(sources.items[0]?.transcriptCount).toBe(0);
  expect(derivatives.items[0]?.tags).toEqual([]);
  expect(derivatives.items[0]?.sourceTranscripts).toEqual([]);
  expect(derivatives.items[0]?.summary).toBe("");
});

test("parses validation counts and diagnostics", () => {
  const result = parseResourceValidation(
    1,
    "[warn] check rights\n[error] missing derivative\n[validate] sources=18 transcripts=7 derivatives=1\n",
  );

  expect(result.ok).toBe(false);
  expect(result.counts).toEqual({ sources: 18, transcripts: 7, derivatives: 1 });
  expect(result.warnings).toEqual(["check rights"]);
  expect(result.errors).toEqual(["missing derivative"]);
});

test("confines derivative previews and skill promotions to their package trees", () => {
  const root = path.resolve("/tmp/ressources");
  expect(resolveResourceDerivativePath(root, "derivatives/rules/example.md")).toBe(
    path.join(root, "derivatives", "rules", "example.md"),
  );
  expect(resolveSkillCandidatePath(root, "derivatives/skills/example.resource.json")).toBe(
    path.join(root, "derivatives", "skills", "example.resource.json"),
  );
  expect(() => resolveResourceDerivativePath(root, "../secrets.txt")).toThrow("must stay inside");
  expect(() => resolveResourceDerivativePath(root, "transcripts/raw.md")).toThrow("must stay inside");
  expect(() => resolveSkillCandidatePath(root, "derivatives/apps/example.resource.json")).toThrow(
    "skill promotion requires",
  );
});

test("resolves candidates through symlinked ancestors but rejects candidate symlinks", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "desktop-resources-"));
  const realRoot = path.join(temp, "real-ressources");
  const linkedRoot = path.join(temp, "linked-ressources");
  const skillsRoot = path.join(realRoot, "derivatives", "skills");
  const candidate = path.join(skillsRoot, "candidate.resource.json");
  const candidateLink = path.join(skillsRoot, "candidate-link.resource.json");

  try {
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(candidate, "{}\n");
    await symlink(realRoot, linkedRoot);
    await symlink(candidate, candidateLink);

    expect(resolveRealSkillCandidatePath(linkedRoot, "derivatives/skills/candidate.resource.json")).toBe(
      candidate,
    );
    expect(() =>
      resolveRealSkillCandidatePath(realRoot, "derivatives/skills/candidate-link.resource.json"),
    ).toThrow("must not be a symbolic link");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("promotion approval requires a matching one-time review", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "desktop-promotion-review-"));
  const candidate = path.join(temp, "candidate.resource.json");
  const gate = new SkillPromotionReviewGate();

  try {
    await writeFile(candidate, "{\"version\":1}\n");
    const firstFingerprint = fingerprintResourceFile(candidate);
    gate.record(candidate, firstFingerprint, 7);

    expect(gate.consume(candidate, firstFingerprint, 8)).toBe(false);
    expect(gate.consume(candidate, firstFingerprint, 7)).toBe(false);

    gate.record(candidate, firstFingerprint, 7);
    await writeFile(candidate, "{\"version\":2}\n");
    expect(gate.consume(candidate, fingerprintResourceFile(candidate), 7)).toBe(false);

    const currentFingerprint = fingerprintResourceFile(candidate);
    gate.record(candidate, currentFingerprint, 7);
    expect(gate.consume(candidate, currentFingerprint, 7)).toBe(true);
    expect(gate.consume(candidate, currentFingerprint, 7)).toBe(false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
