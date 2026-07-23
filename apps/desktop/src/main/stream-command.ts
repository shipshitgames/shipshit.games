import {
  spawn as nodeSpawn,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import path from "node:path";

interface StreamSource {
  on(event: "data", listener: (chunk: unknown) => void): unknown;
}

interface StreamProcess {
  stdout: StreamSource;
  stderr: StreamSource;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals | number): unknown;
}

type StreamSpawn = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => StreamProcess;

type TimerHandle = ReturnType<typeof setTimeout>;
type SetTimer = (callback: () => void, timeoutMs: number) => TimerHandle;
type ClearTimer = (timer: TimerHandle) => void;

interface StreamCommandOptions {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onChunk?: (chunk: string) => void;
  timeoutMs?: number;
  spawnFn?: StreamSpawn;
  setTimer?: SetTimer;
  clearTimer?: ClearTimer;
  formatProcessError?: (error: Error) => string;
}

interface StreamCommandResult {
  code: number | null;
  log: string;
  spawned: boolean;
}

function errorText(error: unknown): string {
  return String(error);
}

function streamCommand(
  options: StreamCommandOptions,
): Promise<StreamCommandResult> {
  const {
    command,
    args = [],
    cwd,
    env,
    onChunk,
    timeoutMs,
    spawnFn = nodeSpawn as unknown as StreamSpawn,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    formatProcessError = (error) => `\nprocess error: ${errorText(error)}\n`,
  } = options;

  return new Promise((resolve) => {
    let child: StreamProcess;
    let log = "";
    const append = (chunk: unknown) => {
      const text = chunk?.toString() ?? "";
      log += text;
      onChunk?.(text);
    };

    try {
      child = spawnFn(command, [...args], { cwd, env });
    } catch (error) {
      append(`spawn failed: ${errorText(error)}\n`);
      resolve({ code: -1, log, spawned: false });
      return;
    }

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => append(formatProcessError(error)));

    const killer =
      Number.isFinite(timeoutMs) && Number(timeoutMs) > 0
        ? setTimer(() => {
            try {
              child.kill("SIGKILL");
              append(
                `\n[timed out after ${Math.round(Number(timeoutMs) / 1000)}s]\n`,
              );
            } catch {
              // The process may have exited between the timeout and kill.
            }
          }, Number(timeoutMs))
        : null;

    child.on("close", (code) => {
      if (killer) clearTimer(killer);
      resolve({ code, log, spawned: true });
    });
  });
}

function parseWroteLine(log: string, extension: string): string | null {
  const expectedExtension = `.${extension.replace(/^\./, "").toLowerCase()}`;
  let result: string | null = null;
  for (const line of log.split(/\r?\n/)) {
    const match =
      /^\[wrote\]\s+(.+?)(?: \([\d.]+ kb, [a-z]+\/[\w.+-]+\))?$/.exec(
        line.trim(),
      );
    if (!match) continue;
    const outputPath = match[1].trim();
    if (path.extname(outputPath).toLowerCase() === expectedExtension) {
      result = outputPath;
    }
  }
  return result;
}

export { parseWroteLine, streamCommand };
export type {
  ClearTimer,
  SetTimer,
  StreamCommandOptions,
  StreamCommandResult,
  StreamProcess,
  StreamSpawn,
  TimerHandle,
};
