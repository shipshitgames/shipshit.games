import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCodexAssetInstruction,
  buildCodexExecArgs,
  resolveCodexPtyWorker,
  runCodexCli,
} from "./codex";
import type { CodexPtyModule, CodexPtyProcess, CodexPtySpawnOptions } from "./codex";

test("buildCodexExecArgs asks Codex to write the exact PNG path", () => {
  const args = buildCodexExecArgs("a parasite-taken host", "/tmp/out.png");
  assert.equal(args[0], "exec");
  assert.ok(args.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.ok(args.includes("--skip-git-repo-check"));
  assert.match(args.at(-1) ?? "", /\/tmp\/out\.png/);
  assert.match(args.at(-1) ?? "", /transparent background/);
});

test("buildCodexExecArgs appends reference images after the prompt", () => {
  const args = buildCodexExecArgs("a parasite-taken host", "/tmp/out.png", "/tmp/work", [
    "/refs/style.png",
    "/refs/source.png",
  ]);
  const instructionIndex = args.findIndex((arg) => arg.includes("Asset prompt:"));
  const imageFlagIndex = args.indexOf("-i");

  assert.ok(instructionIndex > 0);
  assert.equal(imageFlagIndex, instructionIndex + 1);
  assert.deepEqual(args.slice(imageFlagIndex), ["-i", "/refs/style.png", "/refs/source.png"]);
});

test("buildCodexAssetInstruction keeps the asset prompt intact", () => {
  const instruction = buildCodexAssetInstruction("Scourge host, not a generic monster", "/tmp/final.png");
  assert.match(instruction, /gpt-image-2/);
  assert.match(instruction, /Scourge host, not a generic monster/);
  assert.match(instruction, /\/tmp\/final\.png/);
});

test("resolveCodexPtyWorker uses a standalone packaged worker when configured", () => {
  assert.deepEqual(
    resolveCodexPtyWorker({
      ASSETGEN_PTY_WORKER: "/Applications/Studio.app/Contents/Resources/tooling-runtime/bin/bun",
      ASSETGEN_PTY_WORKER_ARGS:
        '["/Applications/Studio.app/Contents/Resources/tooling-runtime/lib/assetgen-codex-pty.cjs"]',
    }),
    {
      command: "/Applications/Studio.app/Contents/Resources/tooling-runtime/bin/bun",
      args: [
        "/Applications/Studio.app/Contents/Resources/tooling-runtime/lib/assetgen-codex-pty.cjs",
      ],
    },
  );
});

test("resolveCodexPtyWorker rejects malformed packaged worker arguments", () => {
  assert.throws(
    () => resolveCodexPtyWorker({
      ASSETGEN_PTY_WORKER: "/runtime/bin/bun",
      ASSETGEN_PTY_WORKER_ARGS: '{"not":"argv"}',
    }),
    /JSON string array/,
  );
});

test("resolveCodexPtyWorker keeps the Node sidecar contract in development", () => {
  const worker = resolveCodexPtyWorker({ ASSETGEN_NODE_BINARY: "/usr/local/bin/node" });
  assert.equal(worker.command, "/usr/local/bin/node");
  assert.equal(worker.args.length, 1);
  assert.match(worker.args[0]!, /codex-pty-worker\.cjs$/);
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

test("runCodexCli forwards reference images to the spawned Codex command", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-codex-test-"));
  const outPath = join(dir, "out.png");
  const calls: Array<{ command: string; args: string[]; opts: CodexPtySpawnOptions }> = [];

  const pty: CodexPtyModule = {
    spawn(command, args, opts) {
      calls.push({ command, args, opts });
      return fakeProcess({
        async onStart(_data, exit) {
          await writeFile(outPath, "png");
          exit({ exitCode: 0 });
        },
      });
    },
  };

  await runCodexCli({
    prompt: "asset prompt",
    outPath,
    cwd: dir,
    pty,
    referenceImages: ["/refs/style.png"],
  });

  assert.deepEqual(calls[0]!.args.slice(-2), ["-i", "/refs/style.png"]);
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
