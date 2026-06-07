import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { appendUsageLog, resolveUsageLogPath, toWrittenUsageEvent } from "./usage";

test("usage events store prompt metadata without raw prompt text", () => {
  const prompt = "do not persist this prompt verbatim";
  const event = toWrittenUsageEvent({
    command: "generate",
    provider: "mock",
    kind: "sprite",
    id: "secret-sprite",
    prompt,
    success: true,
    durationMs: 12,
  });

  assert.equal("prompt" in event, false);
  assert.equal(event.promptChars, prompt.length);
  assert.equal(typeof event.promptHash, "string");
  assert.equal(event.promptHash?.length, 16);
});

test("usage logging can be disabled explicitly", () => {
  assert.equal(resolveUsageLogPath("off"), undefined);
  assert.equal(resolveUsageLogPath("false"), undefined);
});

test("appendUsageLog writes JSONL to the selected path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-usage-test-"));
  const out = join(dir, "usage.jsonl");

  await appendUsageLog(
    {
      command: "matrix",
      provider: "mock",
      kind: "sprite",
      game: "scourge-survivors",
      id: "swarm-husk",
      prompt: "a parasite host",
      success: true,
      durationMs: 8,
    },
    out,
  );

  const line = (await readFile(out, "utf8")).trim();
  const parsed = JSON.parse(line);
  assert.equal(parsed.command, "matrix");
  assert.equal(parsed.provider, "mock");
  assert.equal(parsed.prompt, undefined);
  assert.equal(typeof parsed.promptHash, "string");
});
