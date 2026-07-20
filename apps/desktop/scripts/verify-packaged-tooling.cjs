const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const REQUIRED_TOOLS = ["assetgen", "assetgen-codex-pty", "ressources", "tester"];

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function findRuntimeRoot(appOutDir) {
  const stack = [appOutDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "manifest.json") &&
        path.basename(dir) === "tooling-runtime") {
      return dir;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(dir, entry.name));
    }
  }
  return null;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function verifyFileRecord(runtimeRoot, record, label, executable = false) {
  if (!record || typeof record.path !== "string" || !record.path) {
    throw new Error(`[after-pack] tooling runtime manifest is missing ${label}`);
  }
  const file = path.resolve(runtimeRoot, record.path);
  if (!isInside(runtimeRoot, file)) {
    throw new Error(`[after-pack] ${label} escapes runtime root: ${record.path}`);
  }
  const metadata = fs.lstatSync(file);
  const physicalPath = fs.realpathSync(file);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    !isInside(runtimeRoot, physicalPath) ||
    (executable && (metadata.mode & 0o111) === 0)
  ) {
    throw new Error(`[after-pack] ${label} is missing or invalid: ${file}`);
  }
  if (metadata.size !== record.bytes || sha256(file) !== record.sha256) {
    throw new Error(`[after-pack] ${label} hash or size mismatch`);
  }
  return file;
}

function verifyContainedSymlinks(root, directory = root) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (!isInside(root, fs.realpathSync(file))) {
        throw new Error(`[after-pack] tooling runtime symlink escapes root: ${file}`);
      }
    } else if (entry.isDirectory()) {
      verifyContainedSymlinks(root, file);
    }
  }
}

function verifyRuntimeLayout(runtimeRoot) {
  const manifestPath = path.join(runtimeRoot, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 2) {
    throw new Error(`[after-pack] unsupported tooling runtime schema ${manifest.schemaVersion}`);
  }
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw new Error(
      `[after-pack] tooling runtime target ${manifest.platform}/${manifest.arch} does not match ${process.platform}/${process.arch}`,
    );
  }

  const runtimeExecutable = verifyFileRecord(
    runtimeRoot,
    manifest.runtimeExecutable,
    "Bun runtime executable",
    true,
  );
  const manifestTools = new Map((manifest.tools || []).map((tool) => [tool.name, tool]));
  for (const name of REQUIRED_TOOLS) {
    const record = manifestTools.get(name);
    if (!record) throw new Error(`[after-pack] tooling runtime manifest is missing ${name}`);
    if (path.resolve(runtimeRoot, record.command) !== runtimeExecutable) {
      throw new Error(`[after-pack] ${name} does not use the packaged Bun runtime`);
    }
    const bundle = verifyFileRecord(runtimeRoot, record.bundle, `${name} bundle`);
    const argsPrefix = Array.isArray(record.argsPrefix) ? record.argsPrefix : [];
    if (argsPrefix.length !== 1 || path.resolve(runtimeRoot, argsPrefix[0]) !== bundle) {
      throw new Error(`[after-pack] ${name} has an invalid command prefix`);
    }
  }

  const resourcesRoot = path.join(runtimeRoot, manifest.ressources);
  const browsersRoot = path.join(runtimeRoot, manifest.playwrightBrowsers);
  if (!isInside(runtimeRoot, resourcesRoot) || !isInside(runtimeRoot, browsersRoot)) {
    throw new Error("[after-pack] tooling runtime directory escapes the runtime root");
  }
  for (const required of [
    path.join(resourcesRoot, "schemas"),
    path.join(resourcesRoot, "sources"),
    path.join(resourcesRoot, "transcripts"),
    path.join(resourcesRoot, "derivatives"),
    browsersRoot,
  ]) {
    if (!fs.statSync(required).isDirectory() || !isInside(runtimeRoot, fs.realpathSync(required))) {
      throw new Error(`[after-pack] tooling runtime directory is missing: ${required}`);
    }
  }
  if (fs.readdirSync(browsersRoot).length === 0) {
    throw new Error("[after-pack] packaged Playwright browser directory is empty");
  }
  const nodeModulesRoot = path.join(runtimeRoot, "node_modules");
  if (!fs.statSync(nodeModulesRoot).isDirectory()) {
    throw new Error("[after-pack] packaged production dependencies are missing");
  }
  verifyContainedSymlinks(runtimeRoot, nodeModulesRoot);

  const native = Array.isArray(manifest.nativeArtifacts) ? manifest.nativeArtifacts : [];
  for (const record of native) {
    verifyFileRecord(
      runtimeRoot,
      record,
      `native artifact ${record?.path || "<unknown>"}`,
      record?.path?.endsWith("spawn-helper"),
    );
  }
  if (!native.some((record) => record.path?.includes("sharp") && record.path.endsWith(".node"))) {
    throw new Error("[after-pack] Sharp native addon is missing from the runtime manifest");
  }
  if (!native.some((record) => record.path?.includes("node-pty") && record.path.endsWith(".node"))) {
    throw new Error("[after-pack] node-pty native addon is missing from the runtime manifest");
  }
  if (!native.some((record) => record.path?.includes("node-pty") && record.path.endsWith("spawn-helper"))) {
    throw new Error("[after-pack] node-pty spawn-helper is missing from the runtime manifest");
  }
  return { manifest, runtimeExecutable, resourcesRoot, browsersRoot };
}

function compactOutput(value) {
  const text = String(value || "").trim();
  return text.length > 8_000 ? `${text.slice(0, 8_000)}\n[truncated]` : text;
}

function findElectronNodeHost(runtimeRoot) {
  const macOsRoot = path.join(path.dirname(path.dirname(runtimeRoot)), "MacOS");
  const candidates = fs.readdirSync(macOsRoot)
    .map((name) => path.join(macOsRoot, name))
    .filter((file) => {
      const metadata = fs.statSync(file);
      return metadata.isFile() && (metadata.mode & 0o111) !== 0;
    });
  if (candidates.length !== 1) {
    throw new Error(
      `[after-pack] expected one Electron Node host under ${macOsRoot}, found ${candidates.length}`,
    );
  }
  return candidates[0];
}

function runChecked(label, command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeout || 120_000,
  });
  const record = {
    label,
    command: path.basename(command),
    args,
    status: result.status,
    signal: result.signal,
    stdout: compactOutput(result.stdout),
    stderr: compactOutput(result.stderr),
  };
  if (result.error || result.status !== 0) {
    const cause = result.error ? result.error.message : `exit ${result.status}${result.signal ? ` (${result.signal})` : ""}`;
    throw new Error(
      `[after-pack] ${label} failed: ${cause}\n${record.stdout}\n${record.stderr}`,
    );
  }
  return record;
}

function writeFixture(root) {
  const projectRoot = path.join(root, "project");
  const assetsRoot = path.join(projectRoot, "src", "assets");
  fs.mkdirSync(assetsRoot, { recursive: true });
  fs.writeFileSync(path.join(assetsRoot, "assets.json"), `${JSON.stringify({ assets: [] }, null, 2)}\n`);

  const gameHtml = path.join(root, "game.html");
  fs.writeFileSync(
    gameHtml,
    [
      "<!doctype html>",
      '<meta charset="utf-8">',
      '<canvas id="scene" width="64" height="64"></canvas>',
      "<script>",
      'const canvas = document.querySelector("#scene");',
      'const context = canvas.getContext("2d");',
      'context.fillStyle = "#140f12";',
      "context.fillRect(0, 0, canvas.width, canvas.height);",
      'context.fillStyle = "#a31515";',
      "context.fillRect(8, 8, 32, 32);",
      'context.strokeStyle = "#f1dfbd";',
      "context.lineWidth = 4;",
      "context.beginPath();",
      "context.moveTo(4, 60);",
      "context.lineTo(60, 4);",
      "context.stroke();",
      "window.__GAME_READY__ = true;",
      "</script>",
    ].join("\n"),
  );
  return { projectRoot, gameHtml };
}

function verifyPackagedTooling(appOutDir, outputDir) {
  const runtimeRoot = findRuntimeRoot(appOutDir);
  if (!runtimeRoot) {
    throw new Error(`[after-pack] tooling-runtime/manifest.json not found under ${appOutDir}`);
  }
  const { manifest, runtimeExecutable, resourcesRoot, browsersRoot } =
    verifyRuntimeLayout(runtimeRoot);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-packaged-runtime-"));
  const smokeOutput = path.join(temp, "tester-output");
  const fixture = writeFixture(temp);
  const manifestTools = new Map(manifest.tools.map((tool) => [tool.name, tool]));
  const tool = (name) => {
    const record = manifestTools.get(name);
    if (!record) throw new Error(`[after-pack] tooling runtime manifest is missing ${name}`);
    return {
      command: runtimeExecutable,
      argsPrefix: record.argsPrefix.map((argument) => path.join(runtimeRoot, argument)),
    };
  };
  const assetgen = tool("assetgen");
  const assetgenWorker = tool("assetgen-codex-pty");
  const ressources = tool("ressources");
  const tester = tool("tester");
  const electronNodeHost = findElectronNodeHost(runtimeRoot);
  const env = {
    HOME: path.join(temp, "home"),
    TMPDIR: path.join(temp, "tmp"),
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    PLAYWRIGHT_BROWSERS_PATH: browsersRoot,
    RESSOURCES_SCHEMAS_ROOT: path.join(resourcesRoot, "schemas"),
    ASSETGEN_PTY_WORKER: electronNodeHost,
    ASSETGEN_PTY_WORKER_ARGS: JSON.stringify(assetgenWorker.argsPrefix),
    ASSETGEN_PTY_WORKER_ELECTRON_RUN_AS_NODE: "1",
  };
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.TMPDIR, { recursive: true });

  const runs = [];
  try {
    const ptyRun = runChecked(
      "assetgen Codex PTY worker",
      electronNodeHost,
      assetgenWorker.argsPrefix,
      {
        cwd: temp,
        env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        input: JSON.stringify({
          command: "/bin/echo",
          args: ["packaged-pty-ok"],
          cwd: temp,
          env,
        }),
        timeout: 30_000,
      },
    );
    if (!ptyRun.stdout.includes("packaged-pty-ok")) {
      throw new Error("[after-pack] packaged Codex PTY worker did not relay command output");
    }
    runs.push(ptyRun);
    runs.push(runChecked(
      "assetgen mock generation",
      assetgen.command,
      [
        ...assetgen.argsPrefix,
        "generate",
        "--provider", "mock",
        "--game", "packaged-smoke",
        "--kind", "sprite",
        "--id", "packaged-runtime-smoke",
        "--prompt", "red square runtime smoke asset",
        "--repo", fixture.projectRoot,
        "--size", "64",
      ],
      { cwd: temp, env, timeout: 120_000 },
    ));
    runs.push(runChecked(
      "ressources validation",
      ressources.command,
      [...ressources.argsPrefix, "validate", "--root", resourcesRoot],
      { cwd: temp, env, timeout: 120_000 },
    ));
    runs.push(runChecked(
      "tester browser report",
      tester.command,
      [
        ...tester.argsPrefix,
        "--url", pathToFileURL(fixture.gameHtml).href,
        "--ready", "flag:__GAME_READY__",
        "--canvas", "#scene",
        "--observe", "0",
        "--ready-timeout", "5000",
        "--out", smokeOutput,
        "--report-json", path.join(smokeOutput, "report.json"),
        "--report-md", path.join(smokeOutput, "report.md"),
      ],
      { cwd: temp, env, timeout: 120_000 },
    ));

    const generatedManifest = JSON.parse(
      fs.readFileSync(path.join(fixture.projectRoot, "src", "assets", "assets.json"), "utf8"),
    );
    if (!generatedManifest.assets?.some((asset) => asset.id === "packaged-runtime-smoke")) {
      throw new Error("[after-pack] assetgen smoke did not register the generated asset");
    }
    const testerReport = JSON.parse(fs.readFileSync(path.join(smokeOutput, "report.json"), "utf8"));
    if (testerReport.pass !== true) {
      throw new Error("[after-pack] packaged tester smoke report did not pass");
    }
    if (!fs.existsSync(path.join(smokeOutput, "report.md"))) {
      throw new Error("[after-pack] packaged tester did not record its Markdown report");
    }

    const record = {
      schemaVersion: 1,
      platform: process.platform,
      arch: process.arch,
      verifiedAt: new Date().toISOString(),
      isolatedPath: true,
      runs,
    };
    fs.mkdirSync(outputDir, { recursive: true });
    const recordPath = path.join(outputDir, `runtime-smoke-${process.arch}.json`);
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`[after-pack] tooling runtime OK — assetgen + ressources + tester (${recordPath})`);
    return recordPath;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = {
  findRuntimeRoot,
  findElectronNodeHost,
  isInside,
  verifyPackagedTooling,
  verifyRuntimeLayout,
};
