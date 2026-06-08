#!/usr/bin/env node
// Rebuild node-pty's native addon against Electron's Node ABI.
//
// node-pty ships prebuilt binaries (prebuilds/<platform>-<arch>/pty.node) compiled
// for stock Node's NODE_MODULE_VERSION. Loaded inside Electron — which embeds its
// own Node with a different ABI (Electron 42 = ABI 146, stock Node 26 = ABI 147) —
// the prebuild fails with a NODE_MODULE_VERSION mismatch. On macOS the shipped
// `spawn-helper` can also hit posix_spawnp failures (signing/quarantine).
//
// Building from source produces build/Release/{pty.node,spawn-helper}. node-pty's
// loader (lib/utils.js -> loadNativeModule) checks build/Release BEFORE prebuilds/,
// so the freshly compiled, ABI-correct binary and helper win — fixing both the dev
// and the packaged terminal.
//
// Why this isn't automatic: Bun does not run dependency lifecycle scripts (install/
// postinstall) unless they are in `trustedDependencies`, so node-pty's own build
// never ran. This script makes the rebuild explicit and idempotent.
//
// Usage:
//   node electron/rebuild-native.cjs           # rebuild if needed; exit 1 on failure
//   node electron/rebuild-native.cjs --soft     # never fail the caller (postinstall)
//
// Environment:
//   SSG_SKIP_NATIVE_REBUILD  any value -> skip entirely (escape hatch).
//   SSG_REBUILD_ARCH         target arch to build for (default: host process.arch);
//                            set to e.g. x64 when packaging a non-host dmg.
//   ELECTRON_HEADER_URL      point node-gyp at an alternate Electron headers mirror
//                            when the default (https://www.electronjs.org/headers)
//                            is unreachable.
//
// In CI the --soft postinstall hook is skipped: CI never launches or packages the
// desktop app on the shared Linux runner, so there's no reason to compile native
// code (and pull Electron headers) during `bun install`. Explicit `rebuild:native`
// still runs everywhere.

const fs = require("node:fs");
const path = require("node:path");

const DESKTOP_DIR = path.join(__dirname, "..");
const SOFT = process.argv.includes("--soft");
const TARGET_ARCH = process.env.SSG_REBUILD_ARCH || process.arch;

function log(msg) {
  process.stdout.write(`[rebuild-native] ${msg}\n`);
}

function fail(msg) {
  log(msg);
  if (!SOFT) process.exitCode = 1;
}

function resolveFrom(spec) {
  return require.resolve(spec, { paths: [DESKTOP_DIR] });
}

function electronVersion() {
  // The installed electron package's version is the source of truth for the ABI.
  try {
    const pkg = require(resolveFrom("electron/package.json"));
    if (pkg.version) return pkg.version;
  } catch {
    // fall through to the declared range
  }
  const desktopPkg = require(path.join(DESKTOP_DIR, "package.json"));
  const range = desktopPkg.devDependencies?.electron || desktopPkg.dependencies?.electron || "";
  const match = range.match(/\d+\.\d+\.\d+/);
  if (match) return match[0];
  throw new Error("could not determine the Electron version to build against");
}

function nodePtyDir() {
  // Resolves through Bun's symlinked node_modules to the real package directory.
  return path.dirname(resolveFrom("node-pty/package.json"));
}

function main() {
  if (process.env.SSG_SKIP_NATIVE_REBUILD) {
    log("SSG_SKIP_NATIVE_REBUILD set; skipping native rebuild");
    return;
  }
  // The postinstall hook exists only for local-dev convenience. CI never runs or
  // packages the desktop app, so don't compile native code during `bun install`.
  if (SOFT && process.env.CI) {
    log("CI detected; skipping postinstall native rebuild (run `bun run rebuild:native` to force)");
    return;
  }

  let version;
  try {
    version = electronVersion();
  } catch (err) {
    return fail(err.message || String(err));
  }

  const ptyDir = nodePtyDir();
  const releaseDir = path.join(ptyDir, "build", "Release");
  const builtBinary = path.join(releaseDir, "pty.node");
  const sentinel = path.join(releaseDir, ".electron-rebuild.json");

  // Fast path: already built for this Electron version + arch -> skip (no network).
  if (fs.existsSync(builtBinary) && fs.existsSync(sentinel)) {
    try {
      const meta = JSON.parse(fs.readFileSync(sentinel, "utf8"));
      if (meta.electronVersion === version && meta.arch === TARGET_ARCH) {
        log(`node-pty already built for Electron ${version} (${TARGET_ARCH}); skipping`);
        return;
      }
    } catch {
      // corrupt sentinel -> rebuild
    }
  }

  let rebuild;
  try {
    ({ rebuild } = require(resolveFrom("@electron/rebuild")));
  } catch (err) {
    return fail(
      `@electron/rebuild not found (${err.message}). Install it with: ` +
        "bun add -D @electron/rebuild  (run inside apps/desktop)",
    );
  }

  log(`rebuilding node-pty against Electron ${version} (${TARGET_ARCH})…`);
  const opts = {
    buildPath: DESKTOP_DIR,
    electronVersion: version,
    arch: TARGET_ARCH,
    onlyModules: ["node-pty"],
    force: true,
  };
  if (process.env.ELECTRON_HEADER_URL) {
    opts.headerURL = process.env.ELECTRON_HEADER_URL;
    log(`using headers from ${opts.headerURL}`);
  }

  rebuild(opts)
    .then(() => {
      if (!fs.existsSync(builtBinary)) {
        return fail(`rebuild reported success but ${builtBinary} is missing`);
      }
      fs.mkdirSync(releaseDir, { recursive: true });
      fs.writeFileSync(
        sentinel,
        JSON.stringify({ electronVersion: version, arch: TARGET_ARCH }, null, 2) + "\n",
      );
      log(`done → ${path.relative(DESKTOP_DIR, builtBinary)}`);
    })
    .catch((err) => {
      fail(`rebuild failed: ${err?.message || err}`);
      log("If this is a network/proxy issue, set ELECTRON_HEADER_URL to a reachable Electron headers mirror.");
    });
}

main();
