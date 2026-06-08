import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
