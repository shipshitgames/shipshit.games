import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const runtimeRoot = path.join(desktopRoot, ".runtime");
const binRoot = path.join(runtimeRoot, "bin");
const libRoot = path.join(runtimeRoot, "lib");
const browsersRoot = path.join(runtimeRoot, "playwright-browsers");
const bunExecutable = path.join(binRoot, "bun");
const lockPath = path.join(repoRoot, "bun.lock");

const tools = [
  {
    name: "assetgen",
    entrypoint: path.join(repoRoot, "packages", "assetgen", "src", "cli.ts"),
    bundle: path.join(libRoot, "assetgen.js"),
    format: "esm",
  },
  {
    name: "assetgen-codex-pty",
    entrypoint: path.join(repoRoot, "packages", "assetgen", "src", "codex-pty-worker.cjs"),
    bundle: path.join(libRoot, "assetgen-codex-pty.cjs"),
    format: "cjs",
  },
  {
    name: "ressources",
    entrypoint: path.join(repoRoot, "packages", "ressources", "src", "cli.ts"),
    bundle: path.join(libRoot, "ressources.js"),
    format: "esm",
  },
  {
    name: "tester",
    entrypoint: path.join(repoRoot, "packages", "tester", "src", "cli.ts"),
    bundle: path.join(libRoot, "tester.js"),
    format: "esm",
  },
] as const;

interface PackageJson {
  dependencies?: Record<string, string>;
}

async function packageJson(relativePath: string): Promise<PackageJson> {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8")) as PackageJson;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lockedVersion(lock: string, name: string): string {
  const escaped = escapeRegex(name);
  const match = new RegExp(`^\\s*"${escaped}": \\["${escaped}@([^"]+)"`, "m").exec(lock);
  if (!match?.[1]) throw new Error(`cannot resolve locked runtime dependency ${name}`);
  return match[1];
}

async function installRuntimeDependencies(): Promise<Record<string, string>> {
  const [lock, assetgen, tester] = await Promise.all([
    readFile(lockPath, "utf8"),
    packageJson("packages/assetgen/package.json"),
    packageJson("packages/tester/package.json"),
  ]);
  const names = new Set([
    ...Object.keys(assetgen.dependencies ?? {}),
    ...Object.keys(tester.dependencies ?? {}),
  ]);
  const dependencies = Object.fromEntries(
    [...names].sort().map((name) => [name, lockedVersion(lock, name)]),
  );
  await writeFile(
    path.join(runtimeRoot, "package.json"),
    `${JSON.stringify({
      name: "@shipshitgames/desktop-tooling-runtime",
      private: true,
      dependencies,
      trustedDependencies: ["node-pty", "sharp"],
    }, null, 2)}\n`,
  );
  const proc = Bun.spawn(
    [
      process.execPath,
      "install",
      "--production",
      "--no-save",
      "--backend=copyfile",
      "--linker=hoisted",
    ],
    {
      cwd: runtimeRoot,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await proc.exited;
  if (code !== 0) throw new Error(`failed to install isolated runtime dependencies (exit ${code})`);
  return dependencies;
}

async function buildBundle(tool: (typeof tools)[number]): Promise<void> {
  const proc = Bun.spawn(
    [
      process.execPath,
      "build",
      "--target=bun",
      "--packages=external",
      `--format=${tool.format}`,
      "--outfile",
      tool.bundle,
      tool.entrypoint,
    ],
    {
      cwd: repoRoot,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await proc.exited;
  if (code !== 0) throw new Error(`failed to bundle ${tool.name} (exit ${code})`);
}

async function copyRessourcesLibrary(): Promise<void> {
  const sourceRoot = path.join(repoRoot, "packages", "ressources");
  const destinationRoot = path.join(runtimeRoot, "ressources");
  for (const name of ["sources", "transcripts", "derivatives", "templates", "schemas"]) {
    await cp(path.join(sourceRoot, name), path.join(destinationRoot, name), { recursive: true });
  }
}

async function installChromium(): Promise<void> {
  const runtimeRequire = createRequire(path.join(runtimeRoot, "package.json"));
  const playwrightRoot = path.dirname(runtimeRequire.resolve("playwright"));
  const playwrightCli = path.join(playwrightRoot, "cli.js");
  const proc = Bun.spawn(
    [bunExecutable, playwrightCli, "install", "chromium"],
    {
      cwd: runtimeRoot,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersRoot },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await proc.exited;
  if (code !== 0) throw new Error(`playwright chromium install exited ${code}`);
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function fileRecord(file: string): Promise<{ path: string; bytes: number; sha256: string }> {
  const metadata = await stat(file);
  if (!metadata.isFile()) throw new Error(`runtime artifact is not a file: ${file}`);
  return {
    path: path.relative(runtimeRoot, file),
    bytes: metadata.size,
    sha256: await sha256(file),
  };
}

async function nativeArtifacts(
  directory: string,
): Promise<Array<{ path: string; bytes: number; sha256: string }>> {
  const records: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      records.push(...await nativeArtifacts(file));
    } else if (
      entry.isFile() &&
      (entry.name === "spawn-helper" || /\.(?:node|dylib|so(?:\.\d+)*)$/.test(entry.name))
    ) {
      records.push(await fileRecord(file));
    }
  }
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

await rm(runtimeRoot, { recursive: true, force: true });
await mkdir(binRoot, { recursive: true });
await mkdir(libRoot, { recursive: true });
await copyFile(process.execPath, bunExecutable);
await chmod(bunExecutable, 0o755);
await Promise.all(tools.map(buildBundle));
const dependencies = await installRuntimeDependencies();
await copyRessourcesLibrary();
await installChromium();

const runtimeExecutable = await fileRecord(bunExecutable);
const toolRecords = [];
for (const tool of tools) {
  toolRecords.push({
    name: tool.name,
    command: runtimeExecutable.path,
    argsPrefix: [path.relative(runtimeRoot, tool.bundle)],
    bundle: await fileRecord(tool.bundle),
  });
}
const native = await nativeArtifacts(path.join(runtimeRoot, "node_modules"));
if (!native.some((record) => record.path.includes("sharp") && record.path.endsWith(".node"))) {
  throw new Error("isolated runtime is missing the Sharp native addon");
}
if (!native.some((record) => record.path.includes("node-pty") && record.path.endsWith(".node"))) {
  throw new Error("isolated runtime is missing the node-pty native addon");
}
if (!native.some((record) => record.path.includes("node-pty") && record.path.endsWith("spawn-helper"))) {
  throw new Error("isolated runtime is missing the node-pty spawn-helper");
}
for (const record of native.filter((entry) => entry.path.endsWith("spawn-helper"))) {
  const metadata = await stat(path.join(runtimeRoot, record.path));
  if ((metadata.mode & 0o111) === 0) {
    throw new Error(`node-pty spawn-helper is not executable: ${record.path}`);
  }
}

await writeFile(
  path.join(runtimeRoot, "manifest.json"),
  `${JSON.stringify({
    schemaVersion: 2,
    platform: process.platform,
    arch: process.arch,
    bunVersion: Bun.version,
    runtimeExecutable,
    tools: toolRecords,
    dependencies,
    nativeArtifacts: native,
    ressources: "ressources",
    playwrightBrowsers: "playwright-browsers",
    browserEntries: (await readdir(browsersRoot)).sort(),
  }, null, 2)}\n`,
);

console.log(
  `[tooling-runtime] built ${toolRecords.length} tools with ${native.length} native artifacts at ${runtimeRoot}`,
);
