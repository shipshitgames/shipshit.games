#!/usr/bin/env node
// Headless end-to-end check of the WORKING terminal path against Electron's ABI.
//
// The unit tests (terminal-manager.test.cjs) exercise the manager logic with a mock
// pty. This harness exercises the real thing: it loads node-pty and spawns an actual
// shell under Electron's bundled Node — the exact NODE_MODULE_VERSION the Electron
// main process uses — so it proves the native addon was rebuilt correctly.
//
// When invoked with plain Node it re-execs itself under Electron with
// ELECTRON_RUN_AS_NODE=1 (no window/display required). Under Electron it:
//   1. require()s node-pty (the ABI test — a mismatch throws here),
//   2. starts a session via the production terminal-manager,
//   3. asserts ok:true + a real pid,
//   4. runs `echo "SSG_VERIFY=$((6*7))"` and asserts the streamed output contains
//      SSG_VERIFY=42 — proving the shell actually executed, not just echoed input.
//
// Exit codes: 0 = working, 1 = failure, 2 = Electron not installed/downloaded.

const path = require("node:path");

const DESKTOP_DIR = path.join(__dirname, "..");
const TIMEOUT_MS = 10_000;

function resolveFrom(spec) {
  return require.resolve(spec, { paths: [DESKTOP_DIR] });
}

if (!process.versions.electron) {
  // ---- plain Node: re-exec under Electron's Node so we test Electron's ABI ----
  const { spawnSync } = require("node:child_process");
  let electronBin;
  try {
    electronBin = require(resolveFrom("electron"));
  } catch (err) {
    console.error("[verify] FAIL: electron is not installed:", err.message);
    process.exit(2);
  }
  if (typeof electronBin !== "string") {
    console.error(
      "[verify] FAIL: the Electron binary is not downloaded (no dist/path.txt). " +
        "Download Electron first, then re-run.",
    );
    process.exit(2);
  }
  const res = spawnSync(electronBin, [__filename, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  if (res.error) {
    console.error("[verify] FAIL: could not launch Electron:", res.error.message);
    process.exit(1);
  }
  process.exit(res.status == null ? 1 : res.status);
}

// ---- running under Electron's Node from here on ----
async function run() {
  console.log(
    `[verify] electron=${process.versions.electron} node=${process.versions.node} ` +
      `abi=${process.versions.modules} platform=${process.platform} arch=${process.arch}`,
  );

  let pty;
  try {
    pty = require(resolveFrom("node-pty"));
  } catch (err) {
    console.error("[verify] FAIL: node-pty failed to load against Electron's ABI.");
    console.error(err.stack || err.message || String(err));
    console.error("[verify] Fix: run `bun run rebuild:native` to build node-pty for this Electron version.");
    return 1;
  }
  if (!pty || typeof pty.spawn !== "function") {
    console.error("[verify] FAIL: node-pty loaded but pty.spawn is unavailable.");
    return 1;
  }

  const { createTerminalManager, terminalShell } = require("./terminal-manager.cjs");

  const received = [];
  const webContents = {
    id: 1,
    isDestroyed: () => false,
    send: (channel, payload) => received.push({ channel, payload }),
  };
  const dataString = () =>
    received.filter((m) => m.channel === "terminal:data").map((m) => m.payload.data).join("");

  const manager = createTerminalManager({
    pty,
    cwd: DESKTOP_DIR,
    env: process.env,
    shell: terminalShell(process.platform, process.env),
  });

  const started = manager.start(webContents, { cols: 80, rows: 24 });
  if (!started.ok) {
    console.error("[verify] FAIL: terminal:start did not return ok:true ->", started);
    return 1;
  }
  if (!started.pid) {
    console.error("[verify] FAIL: terminal:start returned no pid ->", started);
    return 1;
  }
  console.log(`[verify] terminal:start ok=true id=${started.id} pid=${started.pid} shell=${started.shell}`);

  const expected = "SSG_VERIFY=42";
  const ok = await new Promise((resolve) => {
    const deadline = setTimeout(() => resolve(false), TIMEOUT_MS);
    const poll = setInterval(() => {
      if (dataString().includes(expected)) {
        clearTimeout(deadline);
        clearInterval(poll);
        resolve(true);
      }
    }, 50);
    // Give the shell a beat to initialize, then run a command whose OUTPUT (not the
    // echoed input) contains the marker, proving real command execution.
    setTimeout(() => manager.write(webContents, started.id, 'echo "SSG_VERIFY=$((6*7))"\r'), 300);
  });

  if (!ok) {
    console.error(`[verify] FAIL: did not observe "${expected}" in streamed output within ${TIMEOUT_MS}ms.`);
    console.error("[verify] captured output (first 800 chars):\n" + dataString().slice(0, 800));
    manager.disposeAll();
    return 1;
  }

  console.log("[verify] streamed shell output contained the executed marker ✓");
  manager.stop(webContents, started.id);
  await new Promise((r) => setTimeout(r, 200)); // let the exit event flush
  manager.disposeAll();
  console.log("[verify] PASS: real shell launched, returned a pid, and streamed live output under Electron's ABI.");
  return 0;
}

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[verify] unexpected error:", err);
    process.exit(1);
  });
