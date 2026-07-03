#!/usr/bin/env node
// Bun skips Electron's install lifecycle, so path.txt can be absent even when
// the package is installed. Run the package installer explicitly for e2e.
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DESKTOP_DIR = path.join(__dirname, "..");
const ELECTRON_DIR = path.dirname(require.resolve("electron/package.json", { paths: [DESKTOP_DIR] }));
const { version } = require(path.join(ELECTRON_DIR, "package.json"));

function resolveFromElectron(spec) {
  return require.resolve(spec, { paths: [ELECTRON_DIR] });
}

function platformPath() {
  const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || os.platform();
  switch (platform) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

function isInstalled() {
  const expectedPath = platformPath();
  try {
    if (fs.readFileSync(path.join(ELECTRON_DIR, "dist", "version"), "utf8").replace(/^v/, "") !== version) return false;
    if (fs.readFileSync(path.join(ELECTRON_DIR, "path.txt"), "utf8") !== expectedPath) return false;
  } catch {
    return false;
  }
  const electronPath = process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(ELECTRON_DIR, "dist", expectedPath);
  return fs.existsSync(electronPath);
}

async function main() {
  if (isInstalled()) {
    process.stdout.write(`[install-electron] Electron ${version} already installed\n`);
    return;
  }

  const { downloadArtifact } = require(resolveFromElectron("@electron/get"));

  const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || process.platform;
  let arch = process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch;
  if (platform === "darwin" && process.platform === "darwin" && arch === "x64" && process.env.npm_config_arch === undefined) {
    try {
      if (childProcess.execSync("sysctl -in sysctl.proc_translated").toString().trim() === "1") arch = "arm64";
    } catch {
      // Not running under Rosetta, or sysctl unavailable.
    }
  }

  process.stdout.write(`[install-electron] downloading Electron ${version} (${platform}/${arch})\n`);
  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    force: process.env.force_no_cache === "true",
    cacheRoot: process.env.electron_config_cache,
    checksums:
      process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
        ? undefined
        : require(path.join(ELECTRON_DIR, "checksums.json")),
    platform,
    arch,
  });

  const distPath = process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(ELECTRON_DIR, "dist");
  fs.rmSync(distPath, { recursive: true, force: true });
  fs.mkdirSync(distPath, { recursive: true });

  const extractCommand = process.platform === "darwin" ? "ditto" : "unzip";
  const extractArgs = process.platform === "darwin"
    ? ["-x", "-k", zipPath, distPath]
    : ["-q", "-o", zipPath, "-d", distPath];
  const extracted = childProcess.spawnSync(extractCommand, extractArgs, { stdio: "inherit" });
  if (extracted.error) throw extracted.error;
  if (extracted.status !== 0) throw new Error(`${extractCommand} exited ${extracted.status}`);

  const srcTypeDefPath = path.join(distPath, "electron.d.ts");
  const targetTypeDefPath = path.join(ELECTRON_DIR, "electron.d.ts");
  if (fs.existsSync(srcTypeDefPath)) fs.renameSync(srcTypeDefPath, targetTypeDefPath);
  await fs.promises.writeFile(path.join(ELECTRON_DIR, "path.txt"), platformPath());
  const electronPath = path.join(distPath, platformPath());
  if (process.platform !== "win32" && fs.existsSync(electronPath)) fs.chmodSync(electronPath, 0o755);
  process.stdout.write(`[install-electron] installed ${path.join("dist", platformPath())}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
