import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ANSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;

export const CODEX_ASSET_TIMEOUT_MS = 300_000;

export interface CodexPtyProcess {
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number; signal?: number | string }) => void): void;
  kill(signal?: string): void;
}

export interface CodexPtyModule {
  spawn(command: string, args: string[], opts: CodexPtySpawnOptions): CodexPtyProcess;
}

export interface CodexPtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

export interface CodexCliOptions {
  prompt: string;
  outPath: string;
  /**
   * Local image references passed to `codex exec -i`.
   *
   * The generated prompt is intentionally kept before `-i`; the Codex CLI treats
   * `-i` as variadic, so references must be appended last.
   */
  referenceImages?: readonly string[];
  /** Codex working directory, passed to `codex exec -C`. */
  cwd: string;
  /** PTY process cwd. Defaults to the current process cwd for Bun/node-pty compatibility. */
  spawnCwd?: string;
  command?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  pty?: CodexPtyModule;
  log?: (chunk: string) => void;
}

export interface CodexCliResult {
  command: string;
  args: string[];
  output: string;
  exitCode: number;
  signal?: number | string;
}

export function buildCodexAssetInstruction(prompt: string, outPath: string): string {
  return [
    "You are running as @shipshitgames/assetgen's local image provider.",
    "Use gpt-image-2 or the best available image-generation capability.",
    `Create one PNG image and save the final file exactly here: ${outPath}`,
    "",
    "Requirements:",
    "- transparent background",
    "- single subject only",
    "- no text, watermark, UI, border, or extra files",
    "- if an intermediate image is created elsewhere, copy or convert the final PNG to the exact path above",
    "",
    `Asset prompt: ${prompt}`,
  ].join("\n");
}

export function buildCodexExecArgs(
  prompt: string,
  outPath: string,
  cwd?: string,
  referenceImages: readonly string[] = [],
): string[] {
  return [
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    ...(cwd ? ["-C", cwd] : []),
    buildCodexAssetInstruction(prompt, outPath),
    ...(referenceImages.length > 0 ? ["-i", ...referenceImages] : []),
  ];
}

export async function runCodexCli(opts: CodexCliOptions): Promise<CodexCliResult> {
  const command = opts.command ?? "codex";
  const args = buildCodexExecArgs(opts.prompt, opts.outPath, opts.cwd, opts.referenceImages);
  const timeoutMs = opts.timeoutMs ?? CODEX_ASSET_TIMEOUT_MS;

  if (opts.pty) {
    return runCodexCliInProcessPty({ ...opts, command, args, timeoutMs });
  }

  return runCodexCliWorker({ ...opts, command, args, timeoutMs });
}

interface ResolvedCodexCliOptions extends CodexCliOptions {
  command: string;
  args: string[];
  timeoutMs: number;
}

async function runCodexCliInProcessPty(opts: ResolvedCodexCliOptions): Promise<CodexCliResult> {
  const pty = opts.pty;
  if (!pty) throw new Error("in-process Codex PTY requires an injected pty module");
  const env = ptyEnv(opts.env);

  return await new Promise<CodexCliResult>((resolve, reject) => {
    let child: CodexPtyProcess | undefined;
    let output = "";
    let settled = false;

    const fail = (message: string) => {
      const clean = stripAnsi(output).trim();
      reject(new Error(clean ? `${message}\n\nCodex output:\n${clean}` : message));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      opts.log?.(`\n[codex] timed out after ${Math.round(opts.timeoutMs / 1000)}s\n`);
      try {
        child?.kill("SIGKILL");
      } catch {
        /* process may already be gone */
      }
      fail(`codex provider timed out after ${Math.round(opts.timeoutMs / 1000)}s`);
    }, opts.timeoutMs);

    try {
      child = pty.spawn(opts.command, opts.args, {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        cwd: opts.spawnCwd ?? process.cwd(),
        env,
      });
    } catch (err) {
      clearTimeout(timer);
      settled = true;
      reject(new Error(`failed to spawn codex via node-pty: ${String(err)}`));
      return;
    }

    child.onExit((event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      void (async () => {
        if (event.exitCode !== 0) {
          fail(`codex provider exited with code ${event.exitCode}`);
          return;
        }

        try {
          await access(opts.outPath);
        } catch {
          fail(`codex provider completed but did not write ${opts.outPath}`);
          return;
        }

        resolve({
          command: opts.command,
          args: opts.args,
          output,
          exitCode: event.exitCode,
          signal: event.signal,
        });
      })();
    });

    child.onData((chunk) => {
      output += chunk;
      opts.log?.(chunk);
    });
  });
}

async function runCodexCliWorker(opts: ResolvedCodexCliOptions): Promise<CodexCliResult> {
  const worker = resolveCodexPtyWorker();
  const request = JSON.stringify({
    command: opts.command,
    args: opts.args,
    cwd: opts.spawnCwd ?? process.cwd(),
    env: ptyEnv(opts.env),
  });

  return await new Promise<CodexCliResult>((resolve, reject) => {
    let output = "";
    let settled = false;
    let child: ReturnType<typeof spawn> | undefined;

    const fail = (message: string) => {
      const clean = stripAnsi(output).trim();
      reject(new Error(clean ? `${message}\n\nCodex output:\n${clean}` : message));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      opts.log?.(`\n[codex] timed out after ${Math.round(opts.timeoutMs / 1000)}s\n`);
      child?.kill("SIGKILL");
      fail(`codex provider timed out after ${Math.round(opts.timeoutMs / 1000)}s`);
    }, opts.timeoutMs);

    try {
      child = spawn(worker.command, worker.args, {
        cwd: opts.spawnCwd ?? process.cwd(),
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      clearTimeout(timer);
      settled = true;
      reject(new Error(`failed to spawn codex PTY worker: ${String(err)}`));
      return;
    }

    if (!child.stdout || !child.stderr || !child.stdin) {
      clearTimeout(timer);
      settled = true;
      reject(new Error("codex PTY worker stdio pipes were not available"));
      return;
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      opts.log?.(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      opts.log?.(text);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`codex PTY worker failed: ${String(err)}`));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      void (async () => {
        if (code !== 0) {
          fail(`codex provider exited with code ${code}`);
          return;
        }

        try {
          await access(opts.outPath);
        } catch {
          fail(`codex provider completed but did not write ${opts.outPath}`);
          return;
        }

        resolve({
          command: opts.command,
          args: opts.args,
          output,
          exitCode: code ?? 0,
          signal: signal ?? undefined,
        });
      })();
    });
    child.stdin.end(request);
  });
}

/**
 * Development runs the checked-in worker through Node. Packaged assetgen
 * injects an architecture-matched standalone worker so the provider never
 * reaches back into a source checkout or assumes Node is installed.
 */
export function resolveCodexPtyWorker(
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  const packagedWorker = env.ASSETGEN_PTY_WORKER?.trim();
  if (packagedWorker) {
    const rawArgs = env.ASSETGEN_PTY_WORKER_ARGS?.trim();
    if (!rawArgs) return { command: packagedWorker, args: [] };
    let args: unknown;
    try {
      args = JSON.parse(rawArgs);
    } catch (error) {
      throw new Error(`ASSETGEN_PTY_WORKER_ARGS must be a JSON string array: ${String(error)}`);
    }
    if (!Array.isArray(args) || !args.every((argument) => typeof argument === "string")) {
      throw new Error("ASSETGEN_PTY_WORKER_ARGS must be a JSON string array");
    }
    return { command: packagedWorker, args };
  }
  const worker = join(dirname(fileURLToPath(import.meta.url)), "codex-pty-worker.cjs");
  return {
    command: env.ASSETGEN_NODE_BINARY?.trim() || "node",
    args: [worker],
  };
}

function ptyEnv(env: NodeJS.ProcessEnv | undefined): Record<string, string> {
  const out = env ?? process.env;
  out.TERM ??= "xterm-256color";
  return out as Record<string, string>;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_RE, "");
}
