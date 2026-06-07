import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCodexAssetInstruction, buildCodexExecArgs, runCodexCli } from "./codex";
import type { CodexPtyModule, CodexPtyProcess, CodexPtySpawnOptions } from "./codex";

test("buildCodexExecArgs asks Codex to write the exact PNG path", () => {
  const args = buildCodexExecArgs("a parasite-taken host", "/tmp/out.png");
  assert.equal(args[0], "exec");
  assert.ok(args.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.ok(args.includes("--skip-git-repo-check"));
  assert.match(args.at(-1) ?? "", /\/tmp\/out\.png/);
  assert.match(args.at(-1) ?? "", /transparent background/);
});

test("buildCodexAssetInstruction keeps the asset prompt intact", () => {
  const instruction = buildCodexAssetInstruction("Scourge host, not a generic monster", "/tmp/final.png");
  assert.match(instruction, /gpt-image-2/);
  assert.match(instruction, /Scourge host, not a generic monster/);
  assert.match(instruction, /\/tmp\/final\.png/);
});

test("runCodexCli streams PTY output and verifies the generated file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-codex-test-"));
  const outPath = join(dir, "out.png");
  const calls: Array<{ command: string; args: string[]; opts: CodexPtySpawnOptions }> = [];
  let logged = "";

  const pty: CodexPtyModule = {
    spawn(command, args, opts) {
      calls.push({ command, args, opts });
      return fakeProcess({
        async onStart(data, exit) {
          data("codex wrote a file\n");
          await writeFile(outPath, "png");
          exit({ exitCode: 0 });
        },
      });
    },
  };

  const result = await runCodexCli({
    prompt: "asset prompt",
    outPath,
    cwd: dir,
    command: "codex-test",
    pty,
    log: (chunk) => {
      logged += chunk;
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.command, "codex-test");
  assert.equal(calls[0]!.opts.cwd, process.cwd());
  assert.equal(calls[0]!.opts.name, "xterm-256color");
  assert.deepEqual(calls[0]!.args.slice(3, 5), ["-C", dir]);
  assert.match(calls[0]!.args.at(-1) ?? "", /asset prompt/);
  assert.match(logged, /codex wrote a file/);
  assert.equal(result.exitCode, 0);
});

test("runCodexCli fails when Codex exits without writing the PNG", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-codex-test-"));
  const pty: CodexPtyModule = {
    spawn() {
      return fakeProcess({
        onStart(data, exit) {
          data("no image produced\n");
          exit({ exitCode: 0 });
        },
      });
    },
  };

  await assert.rejects(
    runCodexCli({
      prompt: "asset prompt",
      outPath: join(dir, "missing.png"),
      cwd: dir,
      pty,
    }),
    /did not write/,
  );
});

function fakeProcess(opts: {
  onStart: (
    data: (chunk: string) => void,
    exit: (event: { exitCode: number; signal?: number | string }) => void,
  ) => void | Promise<void>;
}): CodexPtyProcess {
  let dataCb: (chunk: string) => void = () => {};
  let exitCb: (event: { exitCode: number; signal?: number | string }) => void = () => {};

  queueMicrotask(() => {
    void opts.onStart(
      (chunk) => dataCb(chunk),
      (event) => exitCb(event),
    );
  });

  return {
    onData(cb) {
      dataCb = cb;
    },
    onExit(cb) {
      exitCb = cb;
    },
    kill() {},
  };
}
