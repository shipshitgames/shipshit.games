import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { expect, test } from "bun:test";

import {
  parseWroteLine,
  streamCommand,
  type ClearTimer,
  type SetTimer,
  type StreamProcess,
  type TimerHandle,
} from "./stream-command";

class FakeProcess extends EventEmitter implements StreamProcess {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kills: Array<NodeJS.Signals | number | undefined> = [];

  kill(signal?: NodeJS.Signals | number) {
    this.kills.push(signal);
    return true;
  }
}

test("streams stdout and stderr in arrival order and returns the combined log", async () => {
  const child = new FakeProcess();
  const chunks: string[] = [];
  const calls: unknown[] = [];
  const resultPromise = streamCommand({
    command: "bun",
    args: ["tool.ts", "--flag"],
    cwd: "/repo",
    env: { TOKEN: "redacted" },
    onChunk: (chunk) => chunks.push(chunk),
    spawnFn(command, args, options) {
      calls.push({ command, args, options });
      return child;
    },
  });

  child.stdout.write("one");
  child.stderr.write(" two");
  child.stdout.write(" three");
  child.emit("close", 0);

  await expect(resultPromise).resolves.toEqual({
    code: 0,
    log: "one two three",
    spawned: true,
  });
  expect(chunks).toEqual(["one", " two", " three"]);
  expect(calls).toEqual([
    {
      command: "bun",
      args: ["tool.ts", "--flag"],
      options: { cwd: "/repo", env: { TOKEN: "redacted" } },
    },
  ]);
});

test("returns and streams a stable envelope when spawn throws", async () => {
  const chunks: string[] = [];
  const result = await streamCommand({
    command: "missing",
    onChunk: (chunk) => chunks.push(chunk),
    spawnFn() {
      throw new Error("ENOENT");
    },
  });

  expect(result).toEqual({
    code: -1,
    log: "spawn failed: Error: ENOENT\n",
    spawned: false,
  });
  expect(chunks).toEqual(["spawn failed: Error: ENOENT\n"]);
});

test("streams process errors and clears the timeout when the process closes", async () => {
  const child = new FakeProcess();
  let timeoutCallback: (() => void) | null = null;
  const cleared: TimerHandle[] = [];
  const timer = {
    ref() {},
    unref() {},
    hasRef: () => false,
    refresh() {},
    [Symbol.toPrimitive]: () => 1,
  } as unknown as TimerHandle;
  const setTimer: SetTimer = (callback) => {
    timeoutCallback = callback;
    return timer;
  };
  const clearTimer: ClearTimer = (handle) => {
    cleared.push(handle);
  };
  const resultPromise = streamCommand({
    command: "bun",
    timeoutMs: 300_000,
    spawnFn: () => child,
    setTimer,
    clearTimer,
  });

  child.emit("error", new Error("pipe broke"));
  child.emit("close", 1);
  const result = await resultPromise;

  expect(result.log).toBe("\nprocess error: Error: pipe broke\n");
  expect(cleared).toEqual([timer]);
  expect(timeoutCallback).toBeFunction();
  expect(child.kills).toEqual([]);
});

test("kills timed-out processes and includes the timeout in the returned log", async () => {
  const child = new FakeProcess();
  let timeoutCallback: (() => void) | null = null;
  const setTimer: SetTimer = (callback) => {
    timeoutCallback = callback;
    return 1 as unknown as TimerHandle;
  };
  const resultPromise = streamCommand({
    command: "ffmpeg",
    timeoutMs: 120_000,
    spawnFn: () => child,
    setTimer,
    clearTimer: () => {},
  });

  timeoutCallback?.();
  child.emit("close", null);
  const result = await resultPromise;

  expect(child.kills).toEqual(["SIGKILL"]);
  expect(result).toEqual({
    code: null,
    log: "\n[timed out after 120s]\n",
    spawned: true,
  });
});

test("parses the last wrote-line with the requested extension", () => {
  const log = [
    "[wrote] /tmp/first.md",
    "[wrote] /tmp/image.webp (12.3 kb, image/webp)",
    "[wrote] /tmp/final.MD",
  ].join("\n");

  expect(parseWroteLine(log, "md")).toBe("/tmp/final.MD");
  expect(parseWroteLine(log, ".webp")).toBe("/tmp/image.webp");
  expect(parseWroteLine(log, "ogg")).toBeNull();
});
