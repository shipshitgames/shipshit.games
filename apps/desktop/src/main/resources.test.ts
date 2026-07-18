import { expect, test } from "bun:test";
import path from "node:path";

import {
  parseResourceInventory,
  parseResourceValidation,
  resolveResourceDerivativePath,
  resolveSkillCandidatePath,
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
