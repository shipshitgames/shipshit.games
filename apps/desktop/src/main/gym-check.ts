// Gym checks (#305): boot a declared gym, wait for its URL, then drive it with
// the packaged @shipshitgames/tester command. A run can only pass when the
// tester emits a valid report.json with pass === true.
import crypto from "node:crypto";
import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type {
  GymCheckEventPayload,
  GymCheckReportSummary,
  GymCheckRun,
  GymCheckScreenshot,
  GymCheckStartResult,
  GymCheckStatus,
  GymSummary,
  GymTesterConfig,
  GymsState,
} from "../shared/ipc";
import { GYM_TESTER_DEFAULTS, slugifyGym } from "./gyms";
import type { ToolingCommand } from "./tooling-runtime";

const LOG_CAP = 64 * 1024;
const READY_POLL_MS = 300;
const READY_REQUEST_TIMEOUT_MS = 1_000;
const KILL_GRACE_MS = 3_000;
const RUN_LIST_CAP = 50;
const RUN_STATUSES: ReadonlySet<GymCheckStatus> = new Set([
  "booting",
  "testing",
  "passed",
  "failed",
]);

type TimerHandle = ReturnType<typeof setTimeout>;
type DynamicOption<Value> = Value | (() => Value);
type GymCheckSend = (payload: GymCheckEventPayload) => void;

interface GymCheckStream {
  on(event: "data", listener: (chunk: unknown) => void): unknown;
}

interface GymCheckChild {
  pid?: number;
  stdout?: GymCheckStream;
  stderr?: GymCheckStream;
  once?(event: string, listener: (value: unknown) => void): unknown;
  kill?(signal?: NodeJS.Signals): unknown;
}

type GymCheckSpawn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => GymCheckChild;

type GymCheckFetch = (
  input: string,
  init?: RequestInit,
) => Promise<unknown>;

interface GymCheckLauncher {
  list(): GymsState;
}

interface GymCheckRunnerOptions {
  gyms: GymCheckLauncher;
  rootDir: DynamicOption<string>;
  testerCommand: DynamicOption<ToolingCommand>;
  channel?: DynamicOption<string>;
  env?: DynamicOption<NodeJS.ProcessEnv>;
  spawn?: GymCheckSpawn;
  now?: () => string;
  id?: () => string;
  fetchImpl?: GymCheckFetch;
}

interface GymCheckListOptions {
  projectId?: string;
}

interface GymCheckStartPayload {
  projectId?: string;
  gymId?: string;
}

interface GymCheckEntry {
  run: GymCheckRun;
  tester: GymTesterConfig;
  gym: GymSummary;
  gameChild: GymCheckChild | null;
  testerChild: GymCheckChild | null;
  safetyTimer: TimerHandle | null;
  finalized: boolean;
  send?: GymCheckSend;
}

interface GymCheckRunner {
  start(
    payload?: GymCheckStartPayload,
    send?: GymCheckSend,
  ): Promise<GymCheckStartResult>;
  list(payload?: GymCheckListOptions): { runs: GymCheckRun[] };
  get(runId: string): { run: GymCheckRun | null };
  stop(runId: string): { ok: boolean; error?: string };
  disposeAll(): void;
  image(
    runId: string,
    file: string,
  ): { dataUrl: string; bytes: number } | null;
}

function resolveOption<Value>(value: DynamicOption<Value>): Value {
  return typeof value === "function"
    ? (value as () => Value)()
    : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function capTail(text: string, chunk: string): string {
  const combined = text + chunk;
  return combined.length > LOG_CAP
    ? combined.slice(combined.length - LOG_CAP)
    : combined;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function normalizeReport(
  raw: unknown,
  fallbackUrl: string,
): GymCheckReportSummary | null {
  if (!isRecord(raw)) return null;
  const ready = isRecord(raw.ready) ? raw.ready : {};
  const canvas = isRecord(raw.canvas) ? raw.canvas : {};
  const stats = isRecord(canvas.stats) ? canvas.stats : null;
  const screenshots: GymCheckScreenshot[] = [];
  if (Array.isArray(raw.screenshots)) {
    for (const shot of raw.screenshots) {
      if (!isRecord(shot)) continue;
      screenshots.push({
        name: String(shot.name || ""),
        file: path.basename(String(shot.file || shot.path || "")),
        atMs: finiteNumber(shot.atMs),
      });
    }
  }

  return {
    pass: raw.pass === true,
    failures: toStringArray(raw.failures),
    pageErrors: toStringArray(raw.pageErrors),
    consoleErrors: toStringArray(raw.consoleErrors),
    ready: {
      ok: ready.ok === true,
      mode: typeof ready.mode === "string" ? ready.mode : "",
      waitedMs: finiteNumber(ready.waitedMs),
      error: typeof ready.error === "string" ? ready.error : null,
    },
    canvas: {
      found: canvas.found === true,
      selector: typeof canvas.selector === "string" ? canvas.selector : "",
      width: finiteNumber(canvas.width),
      height: finiteNumber(canvas.height),
      blank: stats
        ? stats.blank === true
        : typeof canvas.blank === "boolean"
          ? canvas.blank
          : null,
      fillRatio: stats
        ? finiteNumber(stats.fillRatio, Number.NaN)
        : finiteNumber(canvas.fillRatio, Number.NaN),
      uniqueColors: stats
        ? finiteNumber(stats.uniqueColors, Number.NaN)
        : finiteNumber(canvas.uniqueColors, Number.NaN),
    },
    screenshots,
    durationMs: finiteNumber(raw.durationMs),
    url:
      typeof raw.url === "string" && raw.url
        ? raw.url
        : fallbackUrl,
  };
}

function nullableFiniteNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function normalizeNullableReport(
  raw: unknown,
  fallbackUrl: string,
): GymCheckReportSummary | null {
  const report = normalizeReport(raw, fallbackUrl);
  if (!report) return null;
  report.canvas.fillRatio = nullableFiniteNumber(
    report.canvas.fillRatio ?? Number.NaN,
  );
  report.canvas.uniqueColors = nullableFiniteNumber(
    report.canvas.uniqueColors ?? Number.NaN,
  );
  return report;
}

function holdTotalMs(hold: readonly string[]): number {
  return hold.reduce((sum, entry) => {
    const ms = Number(entry.slice(entry.lastIndexOf(":") + 1));
    return sum + (Number.isFinite(ms) ? ms : 0);
  }, 0);
}

function testerArgs(
  command: ToolingCommand,
  url: string,
  testerDir: string,
  tester: GymTesterConfig,
  channel: string,
): string[] {
  const args = [
    ...command.argsPrefix,
    "--url",
    url,
    "--out",
    testerDir,
    "--report-json",
    path.join(testerDir, "report.json"),
    "--report-md",
    path.join(testerDir, "report.md"),
    "--ready",
    tester.ready,
    "--ready-timeout",
    String(tester.readyTimeoutMs),
    "--canvas",
    tester.canvas,
    "--observe",
    String(tester.observeMs),
    "--frames",
    String(tester.frames),
  ];
  if (tester.press.length) args.push("--press", tester.press.join(","));
  for (const hold of tester.hold) args.push("--hold", hold);
  for (const shot of tester.shots) args.push("--shot", shot);
  if (!tester.checkBlank) args.push("--no-check-blank");
  if (channel) args.push("--channel", channel);
  return args;
}

function safetyBudgetMs(tester: GymTesterConfig): number {
  const total =
    tester.bootTimeoutMs
    + tester.readyTimeoutMs
    + tester.observeMs
    + holdTotalMs(tester.hold)
    + 60_000;
  return Math.max(60_000, Math.min(300_000, total));
}

const exitedChildren = new WeakSet<GymCheckChild>();

function watchExit(child: GymCheckChild): GymCheckChild {
  child.once?.("close", () => exitedChildren.add(child));
  return child;
}

function signalGroup(
  child: GymCheckChild | null,
  signal: NodeJS.Signals,
): void {
  if (typeof child?.pid !== "number") return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill?.(signal);
    } catch {
      // The process may have exited between the liveness check and signal.
    }
  }
}

function killGroup(child: GymCheckChild | null): void {
  if (!child || typeof child.pid !== "number" || exitedChildren.has(child)) {
    return;
  }
  signalGroup(child, "SIGTERM");
  const timer = setTimeout(() => {
    if (!exitedChildren.has(child)) signalGroup(child, "SIGKILL");
  }, KILL_GRACE_MS);
  timer.unref?.();
}

async function boundedFetch(
  fetchImpl: GymCheckFetch,
  url: string,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController();
  let timeout: TimerHandle | null = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("readiness request timed out"));
    }, timeoutMs);
    timeout.unref?.();
  });
  try {
    await Promise.race([
      fetchImpl(url, { signal: controller.signal }),
      deadline,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function createGymCheckRunner(
  options: GymCheckRunnerOptions,
): GymCheckRunner {
  const rootDir = () => {
    const root = resolveOption(options.rootDir);
    if (!root) throw new Error("gym-check rootDir is required");
    return root;
  };
  const testerCommand = () => resolveOption(options.testerCommand);
  const channel = () =>
    options.channel ? String(resolveOption(options.channel) || "") : "";
  const env = () =>
    options.env ? resolveOption(options.env) : process.env;
  const spawn = options.spawn
    ?? (nodeSpawn as unknown as GymCheckSpawn);
  const now = options.now ?? (() => new Date().toISOString());
  const makeId = options.id ?? (() => crypto.randomUUID());
  const fetchImpl = options.fetchImpl ?? fetch;
  const live = new Map<string, GymCheckEntry>();

  function safeRunId(runId: unknown): string {
    const id = String(runId || "");
    if (!id || id === "." || id === ".." || id !== path.basename(id)) {
      return "";
    }
    return id;
  }

  function runDir(runId: string): string {
    return path.join(rootDir(), runId);
  }

  function testerDirFor(runId: string): string {
    return path.join(runDir(runId), "tester");
  }

  function runFile(runId: string): string {
    return path.join(runDir(runId), "run.json");
  }

  function persist(run: GymCheckRun): void {
    fs.mkdirSync(runDir(run.id), { recursive: true });
    const destination = runFile(run.id);
    const temporary = `${destination}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(run, null, 2));
    fs.renameSync(temporary, destination);
  }

  function normalizeRunRecord(raw: unknown): GymCheckRun | null {
    if (!isRecord(raw) || typeof raw.id !== "string" || !safeRunId(raw.id)) {
      return null;
    }
    const storedStatus = String(raw.status) as GymCheckStatus;
    const status = RUN_STATUSES.has(storedStatus)
      ? storedStatus
      : "failed";
    const interrupted = status === "booting" || status === "testing";
    const url = String(raw.url || "");
    return {
      id: raw.id,
      projectId: String(raw.projectId || ""),
      projectName: String(raw.projectName || ""),
      gymId: String(raw.gymId || ""),
      gymLabel: String(raw.gymLabel || ""),
      url,
      status: interrupted ? "failed" : status,
      startedAt: String(raw.startedAt || ""),
      finishedAt:
        typeof raw.finishedAt === "string" ? raw.finishedAt : null,
      error:
        typeof raw.error === "string"
          ? raw.error
          : interrupted
            ? "desktop closed before the check completed"
            : null,
      bootLog: typeof raw.bootLog === "string" ? raw.bootLog : "",
      testerLog: typeof raw.testerLog === "string" ? raw.testerLog : "",
      report: normalizeNullableReport(raw.report, url),
      reportDir: testerDirFor(raw.id),
      pid:
        typeof raw.pid === "number" && Number.isFinite(raw.pid)
          ? raw.pid
          : null,
    };
  }

  function emit(
    entry: GymCheckEntry,
    payload: GymCheckEventPayload,
  ): void {
    try {
      entry.send?.(payload);
    } catch {
      // A closed renderer must not keep a run alive.
    }
  }

  function finalize(
    entry: GymCheckEntry,
    status: "passed" | "failed",
    error: string | null = null,
  ): void {
    if (entry.finalized) return;
    entry.finalized = true;
    if (entry.safetyTimer) clearTimeout(entry.safetyTimer);
    killGroup(entry.testerChild);
    killGroup(entry.gameChild);
    entry.run.status = status;
    entry.run.error = error;
    entry.run.finishedAt = now();
    try {
      persist(entry.run);
    } catch {
      // The terminal event still tells the renderer the run stopped.
    }
    live.delete(entry.run.id);
    emit(entry, {
      runId: entry.run.id,
      status,
      done: true,
    });
  }

  async function waitForUrl(entry: GymCheckEntry): Promise<boolean> {
    const deadline = Date.now() + entry.tester.bootTimeoutMs;
    while (!entry.finalized) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      try {
        await boundedFetch(
          fetchImpl,
          entry.run.url,
          Math.min(READY_REQUEST_TIMEOUT_MS, remaining),
        );
        return true;
      } catch {
        // A refused or timed-out request means the server is not ready yet.
      }
      const afterRequest = deadline - Date.now();
      if (entry.finalized || afterRequest <= 0) return false;
      await sleep(Math.min(READY_POLL_MS, afterRequest));
    }
    return false;
  }

  async function runPipeline(entry: GymCheckEntry): Promise<void> {
    const { run, gym, tester } = entry;

    if (gym.script || gym.command) {
      const command = gym.command || "bun";
      const args = gym.command
        ? gym.args
        : ["run", gym.script as string, ...gym.args];
      let child: GymCheckChild;
      try {
        child = spawn(command, args, {
          cwd: gym.cwd,
          env: {
            ...env(),
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
          },
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        finalize(
          entry,
          "failed",
          `Failed to launch ${command}: ${errorMessage(error)}`,
        );
        return;
      }
      entry.gameChild = watchExit(child);
      run.pid = typeof child.pid === "number" ? child.pid : null;
      const onBootData = (data: unknown) => {
        if (entry.finalized) return;
        const chunk = String(data);
        run.bootLog = capTail(run.bootLog, chunk);
        emit(entry, {
          runId: run.id,
          status: run.status,
          chunk,
          source: "boot",
        });
      };
      child.stdout?.on("data", onBootData);
      child.stderr?.on("data", onBootData);
      child.once?.("error", (error) => {
        finalize(
          entry,
          "failed",
          `Failed to launch ${command}: ${errorMessage(error)}`,
        );
      });
      child.once?.("close", (code) => {
        if (!entry.finalized && run.status === "booting") {
          finalize(
            entry,
            "failed",
            `game process exited with code ${String(code ?? "unknown")} before the url was ready`,
          );
        }
      });
    }

    const ready = await waitForUrl(entry);
    if (!ready) {
      if (!entry.finalized) {
        finalize(
          entry,
          "failed",
          `game url ${run.url} not ready within ${tester.bootTimeoutMs}ms`,
        );
      }
      return;
    }

    run.status = "testing";
    persist(run);
    emit(entry, { runId: run.id, status: run.status });

    const command = testerCommand();
    let testerChild: GymCheckChild;
    try {
      testerChild = spawn(
        command.command,
        testerArgs(command, run.url, run.reportDir, tester, channel()),
        {
          cwd: command.cwd,
          env: { ...env(), ...command.env },
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      finalize(
        entry,
        "failed",
        `Failed to launch tester: ${errorMessage(error)}`,
      );
      return;
    }
    entry.testerChild = watchExit(testerChild);
    const onTesterData = (data: unknown) => {
      if (entry.finalized) return;
      const chunk = String(data);
      run.testerLog = capTail(run.testerLog, chunk);
      emit(entry, {
        runId: run.id,
        status: run.status,
        chunk,
        source: "tester",
      });
    };
    testerChild.stdout?.on("data", onTesterData);
    testerChild.stderr?.on("data", onTesterData);
    testerChild.once?.("error", (error) => {
      finalize(
        entry,
        "failed",
        `Failed to launch tester: ${errorMessage(error)}`,
      );
    });
    const budget = safetyBudgetMs(tester);
    entry.safetyTimer = setTimeout(() => {
      run.testerLog = capTail(
        run.testerLog,
        `\n[gym check killed after ${budget}ms]\n`,
      );
      finalize(entry, "failed", `tester timed out after ${budget}ms`);
    }, budget);
    entry.safetyTimer.unref?.();
    testerChild.once?.("close", () => {
      if (entry.finalized) return;
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(
          fs.readFileSync(
            path.join(run.reportDir, "report.json"),
            "utf8",
          ),
        );
      } catch {
        // Missing or malformed reports are infrastructure failures.
      }
      const report = normalizeNullableReport(parsed, run.url);
      if (!report) {
        finalize(entry, "failed", "tester produced no report");
        return;
      }
      run.report = report;
      finalize(entry, report.pass ? "passed" : "failed");
    });
  }

  async function start(
    payload: GymCheckStartPayload = {},
    send?: GymCheckSend,
  ): Promise<GymCheckStartResult> {
    const state = options.gyms.list();
    const projectId = String(payload.projectId || "") || state.activeProjectId;
    const project = state.projects.find(
      (candidate) => candidate.id === projectId,
    );
    if (!project) return { ok: false, error: "Project not found" };
    if (!project.exists) {
      return { ok: false, error: "Project path does not exist" };
    }
    if (project.error && project.gyms.length === 0) {
      return { ok: false, error: project.error };
    }
    const gymId = slugifyGym(payload.gymId);
    const gym = project.gyms.find((candidate) => candidate.id === gymId);
    if (!gym) return { ok: false, error: "Gym not found" };
    if (!gym.url) {
      return { ok: false, error: "Gym has no url to check" };
    }

    const tester = gym.tester ?? structuredClone(GYM_TESTER_DEFAULTS);
    const runId = safeRunId(makeId());
    if (!runId) {
      return { ok: false, error: "Could not allocate a run id" };
    }
    const run: GymCheckRun = {
      id: runId,
      projectId: project.id,
      projectName: project.name,
      gymId: gym.id,
      gymLabel: gym.label,
      url: gym.url,
      status: "booting",
      startedAt: now(),
      finishedAt: null,
      error: null,
      bootLog: "",
      testerLog: "",
      report: null,
      reportDir: testerDirFor(runId),
      pid: null,
    };
    const entry: GymCheckEntry = {
      run,
      tester,
      gym,
      gameChild: null,
      testerChild: null,
      safetyTimer: null,
      finalized: false,
      send,
    };
    live.set(runId, entry);
    fs.mkdirSync(run.reportDir, { recursive: true });
    persist(run);
    emit(entry, { runId, status: run.status });
    void runPipeline(entry).catch((error) => {
      finalize(
        entry,
        "failed",
        `gym check failed: ${errorMessage(error)}`,
      );
    });
    return { ok: true, runId, run: structuredClone(run) };
  }

  function list(
    payload: GymCheckListOptions = {},
  ): { runs: GymCheckRun[] } {
    const projectId =
      typeof payload.projectId === "string" ? payload.projectId : "";
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(rootDir(), { withFileTypes: true });
    } catch {
      // A missing root has no persisted runs yet.
    }
    const runs: GymCheckRun[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const liveEntry = live.get(entry.name);
      if (liveEntry) {
        runs.push(structuredClone(liveEntry.run));
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(
          fs.readFileSync(
            path.join(rootDir(), entry.name, "run.json"),
            "utf8",
          ),
        );
      } catch {
        continue;
      }
      const run = normalizeRunRecord(raw);
      if (run?.id === entry.name) runs.push(run);
    }
    const filtered = projectId
      ? runs.filter((run) => run.projectId === projectId)
      : runs;
    filtered.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return { runs: filtered.slice(0, RUN_LIST_CAP) };
  }

  function get(runId: string): { run: GymCheckRun | null } {
    const id = safeRunId(runId);
    if (!id) return { run: null };
    const liveEntry = live.get(id);
    if (liveEntry) return { run: structuredClone(liveEntry.run) };
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(runFile(id), "utf8"));
    } catch {
      return { run: null };
    }
    const run = normalizeRunRecord(raw);
    return { run: run?.id === id ? run : null };
  }

  function stop(runId: string): { ok: boolean; error?: string } {
    const entry = live.get(safeRunId(runId));
    if (!entry) {
      return { ok: false, error: "Run not found or already finished" };
    }
    finalize(entry, "failed", "stopped by operator");
    return { ok: true };
  }

  function disposeAll(): void {
    for (const entry of [...live.values()]) {
      finalize(entry, "failed", "stopped by operator");
    }
  }

  function image(
    runId: string,
    file: string,
  ): { dataUrl: string; bytes: number } | null {
    const id = safeRunId(runId);
    if (!id || !file || file !== path.basename(file)) return null;
    const dir = path.resolve(testerDirFor(id));
    const absolute = path.resolve(dir, file);
    if (!absolute.startsWith(`${dir}${path.sep}`)) return null;
    let data: Buffer;
    try {
      data = fs.readFileSync(absolute);
    } catch {
      return null;
    }
    return {
      dataUrl: `data:image/png;base64,${data.toString("base64")}`,
      bytes: data.length,
    };
  }

  return { start, list, get, stop, disposeAll, image };
}

export {
  createGymCheckRunner,
  normalizeNullableReport as normalizeReport,
  safetyBudgetMs,
  testerArgs,
};
export type {
  GymCheckFetch,
  GymCheckRunner,
  GymCheckRunnerOptions,
  GymCheckSpawn,
};
