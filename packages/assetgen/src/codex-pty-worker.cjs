#!/usr/bin/env node
const { constants } = require("node:fs");
const { accessSync, chmodSync } = require("node:fs");
const { dirname, join } = require("node:path");

function readStdin() {
  return new Promise((resolve, reject) => {
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      body += chunk;
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(body));
  });
}

function ensureSpawnHelperExecutable() {
  if (process.platform === "win32") return;
  let helperPath;
  try {
    const packageJson = require.resolve("node-pty/package.json");
    helperPath = join(dirname(packageJson), "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
  } catch {
    return;
  }

  try {
    accessSync(helperPath, constants.X_OK);
  } catch {
    chmodSync(helperPath, 0o755);
  }
}

(async () => {
  const request = JSON.parse(await readStdin());
  ensureSpawnHelperExecutable();
  const pty = require("node-pty");
  const child = pty.spawn(request.command, request.args, {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: request.cwd || process.cwd(),
    env: request.env || process.env,
  });

  child.onData((chunk) => {
    process.stdout.write(chunk);
  });

  child.onExit((event) => {
    if (event.signal) process.stderr.write(`[codex-pty] signal ${event.signal}\n`);
    process.exit(typeof event.exitCode === "number" ? event.exitCode : 1);
  });
})().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
