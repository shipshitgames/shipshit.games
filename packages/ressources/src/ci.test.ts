import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = resolve(packageRoot, "src/cli.ts");

function runCli(path: string, args: string[]) {
  return spawnSync(process.execPath, [path, ...args], {
    encoding: "utf8",
    timeout: 60_000,
  });
}

test("ci: the copyright-safe valid fixture library passes CLI validation", () => {
  const result = runCli(cliPath, ["validate", "--root", resolve(packageRoot, "fixtures/valid")]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[validate\] sources=1 transcripts=1 derivatives=1/);
});

test("ci: invalid source, transcript, and derivative fixtures report useful CLI errors", () => {
  const result = runCli(cliPath, ["validate", "--root", resolve(packageRoot, "fixtures/invalid")]);

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /invalid-source\.kind must be one of/);
  assert.match(result.stderr, /invalid-transcript\.rights\.status must be one of/);
  assert.match(result.stderr, /invalid-derivative\.kind must be one of/);
});

test("ci: mock distillation and transcript/derivative creation produce a valid library", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ressources-ci-"));
  const tempPackageRoot = join(tempRoot, "ressources");

  try {
    cpSync(packageRoot, tempPackageRoot, { recursive: true });
    const tempCliPath = resolve(tempPackageRoot, "src/cli.ts");
    const transcriptRelative = "transcripts/ai-oriented-dev/ci-generated-transcript.resource.json";
    const transcriptPath = resolve(
      tempPackageRoot,
      "transcripts/ai-oriented-dev/ci-generated-transcript.transcript.md",
    );
    const rulesPath = resolve(tempPackageRoot, "derivatives/rules/ci-generated-rules.md");

    const transcript = runCli(tempCliPath, [
      "new-transcript",
      "--source",
      "ai-oriented-dev",
      "--url",
      "https://example.com/ci-transcript",
      "--title",
      "CI Generated Transcript",
      "--slug",
      "ci-generated-transcript",
      "--rights",
      "user-provided",
    ]);
    assert.equal(transcript.status, 0, transcript.stderr);
    assert.match(transcript.stdout, /\[transcript\] transcripts\/ai-oriented-dev\/ci-generated-transcript\.transcript\.md/);

    const derivative = runCli(tempCliPath, [
      "new-derivative",
      "--kind",
      "rule",
      "--slug",
      "ci-generated-rules",
      "--title",
      "CI Generated Rules",
      "--source-transcript",
      transcriptRelative,
    ]);
    assert.equal(derivative.status, 0, derivative.stderr);
    assert.match(derivative.stdout, /\[derivative\] derivatives\/rules\/ci-generated-rules\.md/);

    const distillation = runCli(tempCliPath, [
      "distill",
      "--transcript-file",
      transcriptPath,
      "--title",
      "CI Generated Transcript",
      "--provider",
      "mock",
      "--out",
      rulesPath,
    ]);
    assert.equal(distillation.status, 0, distillation.stderr);
    assert.match(readFileSync(rulesPath, "utf8"), /Mock distillation \(no model\)/);

    const validation = runCli(tempCliPath, ["validate"]);
    assert.equal(validation.status, 0, validation.stderr);
    assert.match(validation.stdout, /\[validate\] sources=19 transcripts=8 derivatives=2/);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});
