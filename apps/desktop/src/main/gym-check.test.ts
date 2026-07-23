import { afterEach, beforeEach, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGymCheckRunner } from "./gym-check";
import { createGymLauncher } from "./gyms";

const temps = [];
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitUntil timed out");
    await sleep(10);
  }
}

// Children spawn detached and die via process.kill(-pid, ...) on their group;
// record those group signals instead of letting them hit real pids.
const realProcessKill = process.kill;
let groupKills = [];
beforeEach(() => {
  groupKills = [];
  process.kill = ((pid, signal) => {
    if (typeof pid === "number" && pid < 0) {
      groupKills.push({ pid, signal });
      return true;
    }
    return realProcessKill.call(process, pid, signal);
  }) as any;
});
afterEach(() => {
  process.kill = realProcessKill;
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true });
});

function repoWithGyms(gyms) {
  const repo = tempDir("shipshit-gym-check-repo-");
  fs.writeFileSync(path.join(repo, "studio.gyms.json"), JSON.stringify({ gyms }, null, 2));
  return repo;
}

function launcherFor(repo) {
  return createGymLauncher({
    projects: [{ id: "project-1", name: "Scourge Survivors", slug: "scourge-survivors", repoPath: repo }],
    activeProjectId: "project-1",
  });
}

function passReport(url) {
  return {
    url,
    startedAt: "2026-07-10T00:00:00.000Z",
    finishedAt: "2026-07-10T00:00:05.000Z",
    durationMs: 5000,
    ready: { ok: true, mode: 'canvas "canvas"', waitedMs: 120 },
    canvas: {
      found: true,
      selector: "canvas",
      width: 1280,
      height: 720,
      stats: { sampleWidth: 320, sampleHeight: 180, fillRatio: 0.42, uniqueColors: 17, meanLuma: 90, variance: 30, blank: false },
    },
    steps: [],
    screenshots: [{ name: "boot", path: "boot.png", atMs: 500 }],
    consoleErrors: [],
    pageErrors: [],
    pass: true,
    failures: [],
  };
}

function fakeChild(pid) {
  const child = new EventEmitter() as any;
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kills = [];
  child.kill = (signal) => {
    child.kills.push(signal || "SIGTERM");
    return true;
  };
  return child;
}

// The tester fake honors --out: it writes report.json + named screenshots there
// (like the real CLI) before closing, so the runner parses a real file round-trip.
function makeSpawn(options: any = {}) {
  const { report = null, testerCloses = true, gameCloses = null } = options;
  const calls = [];
  const spawn = (command, args, opts) => {
    const isTester = args.includes("--url");
    const child = fakeChild((isTester ? 900 : 700) + calls.length);
    calls.push({ command, args, opts, child, isTester });
    if (isTester) {
      setTimeout(() => {
        if (report) {
          const out = args[args.indexOf("--out") + 1];
          fs.mkdirSync(out, { recursive: true });
          const filled = {
            ...report,
            screenshots: report.screenshots.map((shot) => ({ ...shot, path: path.join(out, `${shot.name}.png`) })),
          };
          for (const shot of filled.screenshots) fs.writeFileSync(shot.path, "png-bytes");
          fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(filled, null, 2));
        }
        child.stdout.emit("data", Buffer.from("tester: driving game\n"));
        if (testerCloses) child.emit("close", report && report.pass ? 0 : 1);
      }, 0);
    } else {
      setTimeout(() => {
        child.stdout.emit("data", Buffer.from("dev server listening\n"));
        if (gameCloses !== null) child.emit("close", gameCloses);
      }, 0);
    }
    return child;
  };
  return { spawn, calls };
}

function makeRunner(options: any = {}) {
  const root = options.root || tempDir("shipshit-gym-check-root-");
  let n = 0;
  const runner = createGymCheckRunner({
    gyms: launcherFor(options.repo),
    rootDir: () => root,
    testerCommand: () => ({
      command: "/runtime/bin/bun",
      argsPrefix: ["/runtime/lib/tester.js"],
      cwd: "/runtime/work",
      env: { PLAYWRIGHT_BROWSERS_PATH: "/runtime/browsers" },
    }),
    channel: () => options.channel || "",
    spawn: options.spawn,
    env: () => ({ PATH: "/bin" }),
    id: options.id || (() => `run-${++n}`),
    fetchImpl: options.fetchImpl,
  });
  return { runner, root };
}

function eventCollector() {
  const events = [];
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const send = (payload) => {
    events.push(payload);
    if (payload.done) resolveDone(payload);
  };
  return { events, send, done };
}

const urlUp = async () => ({ ok: true, status: 200 });
const urlDown = async () => {
  throw new Error("ECONNREFUSED");
};

test("a passing check runs booting -> testing -> passed with a normalized report", async () => {
  const url = "http://localhost:5199/";
  const repo = repoWithGyms([
    {
      id: "playfield",
      script: "gym:dev",
      args: ["--port", "5199"],
      url,
      tester: { press: "ArrowUp,Space", shots: "boot", observeMs: 0, frames: 0 },
    },
  ]);
  const { spawn, calls } = makeSpawn({ report: passReport(url) });
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlUp });
  const { events, send, done } = eventCollector();

  const started = await runner.start({ projectId: "project-1", gymId: "playfield" }, send);
  expect(started.ok).toBe(true);
  expect(started.run.status).toBe("booting");
  await done;

  const { run } = runner.get(started.runId);
  expect(run.status).toBe("passed");
  expect(run.error).toBeNull();
  expect(run.finishedAt).not.toBeNull();
  expect(run.report.pass).toBe(true);
  expect(run.report.canvas).toMatchObject({ found: true, blank: false, fillRatio: 0.42, uniqueColors: 17 });
  expect(run.report.screenshots).toEqual([{ name: "boot", file: "boot.png", atMs: 500 }]);
  expect(run.bootLog).toContain("dev server listening");
  expect(run.testerLog).toContain("driving game");
  expect(run.pid).toBe(700);

  const statuses = events.map((event) => event.status);
  expect(statuses[0]).toBe("booting");
  expect(statuses).toContain("testing");
  expect(statuses[statuses.length - 1]).toBe("passed");
  expect(events.filter((event) => event.done)).toHaveLength(1);

  const game = calls.find((call) => !call.isTester);
  expect(game.command).toBe("bun");
  expect(game.args).toEqual(["run", "gym:dev", "--port", "5199"]);
  expect(game.opts).toMatchObject({ cwd: repo, detached: true, stdio: ["ignore", "pipe", "pipe"] });

  const tester = calls.find((call) => call.isTester);
  const argAfter = (flag) => tester.args[tester.args.indexOf(flag) + 1];
  expect(tester.command).toBe("/runtime/bin/bun");
  expect(tester.args[0]).toBe("/runtime/lib/tester.js");
  expect(argAfter("--url")).toBe(url);
  expect(path.isAbsolute(argAfter("--out"))).toBe(true);
  expect(argAfter("--out")).toBe(run.reportDir);
  expect(argAfter("--report-json")).toBe(path.join(run.reportDir, "report.json"));
  expect(argAfter("--press")).toBe("ArrowUp,Space");
  expect(argAfter("--shot")).toBe("boot");
  expect(tester.args).not.toContain("--channel");
  expect(tester.opts).toMatchObject({
    cwd: "/runtime/work",
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: "/bin",
      PLAYWRIGHT_BROWSERS_PATH: "/runtime/browsers",
    },
  });

  // The dev server must not outlive the run: its group was SIGTERM'd at finalize.
  expect(groupKills.some((kill) => kill.pid === -game.child.pid && kill.signal === "SIGTERM")).toBe(true);
});

test("a report with pass:false finalizes failed with the report's failures (no send needed)", async () => {
  const url = "http://localhost:5199/";
  const repo = repoWithGyms([{ id: "playfield", url, tester: { observeMs: 0 } }]);
  const report = { ...passReport(url), pass: false, failures: ["canvas is blank"] };
  const { spawn } = makeSpawn({ report });
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlUp });

  const started = await runner.start({ projectId: "project-1", gymId: "playfield" });
  expect(started.ok).toBe(true);
  await waitUntil(() => runner.get(started.runId).run.status === "failed");

  const { run } = runner.get(started.runId);
  expect(run.error).toBeNull();
  expect(run.report.pass).toBe(false);
  expect(run.report.failures).toEqual(["canvas is blank"]);
});

test("a game process that dies before the url answers fails without spawning the tester", async () => {
  const repo = repoWithGyms([{ id: "playfield", script: "gym:dev", url: "http://localhost:5199/" }]);
  const { spawn, calls } = makeSpawn({ gameCloses: 1 });
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlDown });
  const { send, done } = eventCollector();

  const started = await runner.start({ projectId: "project-1", gymId: "playfield" }, send);
  await done;

  const { run } = runner.get(started.runId);
  expect(run.status).toBe("failed");
  expect(run.error).toContain("exited with code 1");
  expect(run.bootLog).toContain("dev server listening");
  expect(run.report).toBeNull();
  expect(calls).toHaveLength(1);
});

test("a url that never answers fails the run after the boot budget", async () => {
  const repo = repoWithGyms([{ id: "remote", url: "http://localhost:5321/", tester: { bootTimeoutMs: 1000 } }]);
  const { spawn, calls } = makeSpawn();
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlDown });
  const { send, done } = eventCollector();

  const started = await runner.start({ projectId: "project-1", gymId: "remote" }, send);
  await done;

  const { run } = runner.get(started.runId);
  expect(run.status).toBe("failed");
  expect(run.error).toContain("not ready within 1000ms");
  expect(run.report).toBeNull();
  expect(calls).toHaveLength(0);
});

test("a readiness request that never settles cannot exceed the boot budget", async () => {
  const repo = repoWithGyms([
    {
      id: "remote",
      url: "http://localhost:5321/",
      tester: { bootTimeoutMs: 1000 },
    },
  ]);
  const { spawn, calls } = makeSpawn();
  const neverSettles = () => new Promise(() => {});
  const { runner } = makeRunner({
    repo,
    spawn,
    fetchImpl: neverSettles,
  });
  const { send, done } = eventCollector();

  const started = await runner.start(
    { projectId: "project-1", gymId: "remote" },
    send,
  );
  await done;

  const { run } = runner.get(started.runId);
  expect(run.status).toBe("failed");
  expect(run.error).toContain("not ready within 1000ms");
  expect(calls).toHaveLength(0);
});

test("a tester that exits without report.json fails with a readable error", async () => {
  const repo = repoWithGyms([{ id: "playfield", url: "http://localhost:5199/" }]);
  const { spawn } = makeSpawn({ report: null });
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlUp });
  const { send, done } = eventCollector();

  const started = await runner.start({ projectId: "project-1", gymId: "playfield" }, send);
  await done;

  const { run } = runner.get(started.runId);
  expect(run.status).toBe("failed");
  expect(run.error).toBe("tester produced no report");
  expect(run.testerLog).toContain("driving game");
});

test("stop kills both process groups and finalizes 'stopped by operator'", async () => {
  const url = "http://localhost:5199/";
  const repo = repoWithGyms([{ id: "playfield", script: "gym:dev", url }]);
  const { spawn, calls } = makeSpawn({ report: passReport(url), testerCloses: false });
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlUp });
  const { events, send, done } = eventCollector();

  const started = await runner.start({ projectId: "project-1", gymId: "playfield" }, send);
  await waitUntil(() => calls.some((call) => call.isTester));

  expect(runner.stop(started.runId)).toEqual({ ok: true });
  await done;

  const { run } = runner.get(started.runId);
  expect(run.status).toBe("failed");
  expect(run.error).toBe("stopped by operator");
  for (const call of calls) {
    expect(groupKills.some((kill) => kill.pid === -call.child.pid && kill.signal === "SIGTERM")).toBe(true);
  }
  expect(events.filter((event) => event.done)).toHaveLength(1);
  expect(runner.stop(started.runId).ok).toBe(false);
});

test("disposeAll finalizes every live run", async () => {
  const url = "http://localhost:5199/";
  const repo = repoWithGyms([{ id: "playfield", script: "gym:dev", url }]);
  const { spawn, calls } = makeSpawn({ report: passReport(url), testerCloses: false });
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlUp });
  const { send, done } = eventCollector();

  const started = await runner.start({ projectId: "project-1", gymId: "playfield" }, send);
  await waitUntil(() => calls.some((call) => call.isTester));
  runner.disposeAll();
  await done;

  const { run } = runner.get(started.runId);
  expect(run.status).toBe("failed");
  expect(run.error).toBe("stopped by operator");
});

test("list round-trips persisted runs newest-first, skipping corrupt records", async () => {
  const url = "http://localhost:5199/";
  const repo = repoWithGyms([{ id: "playfield", url, tester: { observeMs: 0 } }]);
  const { spawn } = makeSpawn({ report: passReport(url) });
  const { runner, root } = makeRunner({ repo, spawn, fetchImpl: urlUp });
  const { send, done } = eventCollector();

  const started = await runner.start({ projectId: "project-1", gymId: "playfield" }, send);
  await done;

  fs.mkdirSync(path.join(root, "corrupt"), { recursive: true });
  fs.writeFileSync(path.join(root, "corrupt", "run.json"), "{nope");
  fs.mkdirSync(path.join(root, "older"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "older", "run.json"),
    JSON.stringify({
      id: "older",
      projectId: "project-2",
      projectName: "Deadlane",
      gymId: "arena",
      gymLabel: "Arena",
      url: "http://localhost:5300/",
      status: "failed",
      startedAt: "2020-01-01T00:00:00.000Z",
      finishedAt: "2020-01-01T00:01:00.000Z",
      error: "stopped by operator",
      bootLog: "",
      testerLog: "",
      report: null,
      reportDir: "/tmp/anywhere",
      pid: null,
    }),
  );

  // A fresh runner over the same rootDir must read everything back from disk.
  const fresh = makeRunner({ repo, spawn, fetchImpl: urlUp, root }).runner;
  const { runs } = fresh.list();
  expect(runs.map((run) => run.id)).toEqual([started.runId, "older"]);
  expect(runs[0].status).toBe("passed");
  expect(runs[0].report.pass).toBe(true);
  // reportDir is recomputed under rootDir, never trusted from disk.
  expect(runs[1].reportDir).toBe(path.join(root, "older", "tester"));

  expect(fresh.list({ projectId: "project-2" }).runs.map((run) => run.id)).toEqual(["older"]);
  expect(fresh.list({ projectId: "nope" }).runs).toEqual([]);
  expect(fresh.get(started.runId).run.report.screenshots).toEqual([{ name: "boot", file: "boot.png", atMs: 500 }]);
  expect(fresh.get("missing").run).toBeNull();
});

test("image returns a png data url and refuses paths that escape the tester dir", async () => {
  const url = "http://localhost:5199/";
  const repo = repoWithGyms([{ id: "playfield", url, tester: { shots: "boot" } }]);
  const { spawn } = makeSpawn({ report: passReport(url) });
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlUp });
  const { send, done } = eventCollector();

  const started = await runner.start({ projectId: "project-1", gymId: "playfield" }, send);
  await done;

  const shot = runner.image(started.runId, "boot.png");
  expect(shot.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  expect(shot.bytes).toBeGreaterThan(0);
  expect(runner.image(started.runId, "../run.json")).toBeNull();
  expect(runner.image(started.runId, path.join(os.tmpdir(), "outside.png"))).toBeNull();
  expect(runner.image("../../etc", "boot.png")).toBeNull();
  expect(runner.image(started.runId, "missing.png")).toBeNull();
});

test("start refuses unknown projects, unknown gyms, and gyms without a url", async () => {
  const repo = repoWithGyms([{ id: "headless", script: "gym:dev" }]);
  const { spawn } = makeSpawn();
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlUp });

  expect((await runner.start({ projectId: "nope", gymId: "headless" })).ok).toBe(false);
  expect((await runner.start({ projectId: "project-1", gymId: "missing" })).error).toBe("Gym not found");
  const noUrl = await runner.start({ projectId: "project-1", gymId: "headless" });
  expect(noUrl.ok).toBe(false);
  expect(noUrl.error).toContain("url");
});

test("a configured channel is forwarded to the tester CLI", async () => {
  const url = "http://localhost:5199/";
  const repo = repoWithGyms([{ id: "playfield", url }]);
  const { spawn, calls } = makeSpawn({ report: passReport(url) });
  const { runner } = makeRunner({ repo, spawn, fetchImpl: urlUp, channel: "beta" });
  const { send, done } = eventCollector();

  await runner.start({ projectId: "project-1", gymId: "playfield" }, send);
  await done;

  const tester = calls.find((call) => call.isTester);
  expect(tester.args[tester.args.indexOf("--channel") + 1]).toBe("beta");
});
