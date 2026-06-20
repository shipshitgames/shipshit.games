import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

import { canStoreRawTranscript, validateLibrary } from "./library";
import type { SourceManifest, TranscriptResource } from "./types";

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

test("a slug-valid source missing rights records a schema error instead of crashing the run", async () => {
  // Regression: a source with a valid string slug but no `rights` object, referenced
  // by a transcript whose transcriptPath exists on disk, used to throw an uncaught
  // TypeError out of canStoreRawTranscript (dereferencing source.rights.storeRawTranscript).
  // That aborted the whole run and suppressed the actionable schema diagnostics. The
  // schema pass already flags the missing rights, so the semantic raw-storage rule must
  // be skipped: the run surfaces a clean schema error and exits non-zero, never throws.
  const root = await mkdtemp(join(tmpdir(), "ressources-validate-rights-"));
  try {
    await mkdir(join(root, "sources", "orphan-rights"), { recursive: true });
    await writeFile(
      join(root, "sources", "orphan-rights", "source.json"),
      JSON.stringify({
        schemaVersion: 1,
        slug: "orphan-rights",
        kind: "other",
        title: "Orphan Rights",
        url: "https://example.com/orphan",
        priority: "reference",
        status: "active",
        topics: [],
        // rights intentionally omitted — this is the malformed manifest under test.
        desiredOutputs: [],
        notes: [],
      }),
      "utf8",
    );

    await mkdir(join(root, "transcripts", "orphan-rights"), { recursive: true });
    await writeFile(
      join(root, "transcripts", "orphan-rights", "clip.transcript.md"),
      "# Clip\n\nAuthorized transcript text.\n",
      "utf8",
    );
    await writeFile(
      join(root, "transcripts", "orphan-rights", "clip.resource.json"),
      JSON.stringify({
        schemaVersion: 1,
        slug: "clip",
        sourceSlug: "orphan-rights",
        sourceKind: "youtube-video",
        title: "Clip",
        url: "https://example.com/clip",
        capturedAt: "2026-01-01T00:00:00.000Z",
        // Resolved against the run root; the file above makes transcriptExists true,
        // which is the precondition that previously reached the crashing call site.
        transcriptPath: "transcripts/orphan-rights/clip.transcript.md",
        transcriptFormat: "markdown",
        rights: { status: "user-provided", notes: "Rights reviewed for this transcript resource." },
        tags: [],
        derivatives: { skillCandidates: [], appCandidates: [], toolCandidates: [] },
      }),
      "utf8",
    );

    // Before the fix this call threw an uncaught TypeError; it must now return cleanly.
    const result = await validateLibrary(root);

    assert.equal(result.ok, false);
    assert.ok(
      result.errors.includes("orphan-rights.rights must be an object"),
      `expected a schema error for the missing rights object, got: ${JSON.stringify(result.errors)}`,
    );
    // The semantic raw-storage rule is skipped when rights is malformed, so the
    // schema problem is reported exactly once — no double-reporting.
    assert.equal(
      result.errors.filter((error) => error.includes("stores raw transcript text")).length,
      0,
    );
    assert.equal(result.counts.sources, 1);
    assert.equal(result.counts.transcripts, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
