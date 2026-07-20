import fs from "node:fs";
import path from "node:path";

export const TOOLING_RUNTIME_DIRECTORY = "tooling-runtime";
export const TOOLING_RUNTIME_SCHEMA_VERSION = 2;

export type ToolingExecutableName = "assetgen" | "ressources" | "tester";

export interface ToolingCommand {
  command: string;
  argsPrefix: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface ToolingRuntime {
  mode: "development" | "packaged";
  repoRoot: string | null;
  runtimeRoot: string;
  workRoot: string;
  resourcesRoot: string;
  skillsRoot: string;
  terminalCwd: string;
  assetgen: ToolingCommand;
  ressources: ToolingCommand;
  tester: ToolingCommand;
  requiredPaths: string[];
}

interface ResolveToolingRuntimeOptions {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
  userDataPath: string;
  homePath: string;
}

function packagedCommand(
  runtimeRoot: string,
  workRoot: string,
  bundle: string,
  env: Record<string, string> = {},
): ToolingCommand {
  return {
    command: path.join(runtimeRoot, "bin", "bun"),
    argsPrefix: [path.join(runtimeRoot, "lib", bundle)],
    cwd: workRoot,
    env,
  };
}

function developmentCommand(repoRoot: string, packageName: ToolingExecutableName): ToolingCommand {
  return {
    command: "bun",
    argsPrefix: [path.join(repoRoot, "packages", packageName, "src", "cli.ts")],
    cwd: repoRoot,
    env: {},
  };
}

/**
 * Resolve one logical tool contract for both source development and installed
 * builds. Callers always append tool argv to `argsPrefix` and spawn `command`;
 * no feature handler needs to know whether Bun source or a signed executable is
 * behind the contract.
 */
export function resolveToolingRuntime(options: ResolveToolingRuntimeOptions): ToolingRuntime {
  if (!options.isPackaged) {
    const repoRoot = path.resolve(options.appPath, "..", "..");
    const resourcesRoot = path.join(repoRoot, "packages", "ressources");
    return {
      mode: "development",
      repoRoot,
      runtimeRoot: repoRoot,
      workRoot: repoRoot,
      resourcesRoot,
      skillsRoot: path.join(repoRoot, ".agents", "skills"),
      terminalCwd: repoRoot,
      assetgen: developmentCommand(repoRoot, "assetgen"),
      ressources: developmentCommand(repoRoot, "ressources"),
      tester: developmentCommand(repoRoot, "tester"),
      requiredPaths: [
        path.join(repoRoot, "packages", "assetgen", "src", "cli.ts"),
        path.join(repoRoot, "packages", "ressources", "src", "cli.ts"),
        path.join(repoRoot, "packages", "tester", "src", "cli.ts"),
      ],
    };
  }

  const runtimeRoot = path.join(options.resourcesPath, TOOLING_RUNTIME_DIRECTORY);
  const workRoot = path.join(options.userDataPath, "tooling");
  const resourcesRoot = path.join(runtimeRoot, "ressources");
  const browserRoot = path.join(runtimeRoot, "playwright-browsers");
  const bunCommand = path.join(runtimeRoot, "bin", "bun");
  const assetgenWorker = path.join(runtimeRoot, "lib", "assetgen-codex-pty.cjs");
  const assetgen = packagedCommand(runtimeRoot, workRoot, "assetgen.js", {
    ASSETGEN_PTY_WORKER: bunCommand,
    ASSETGEN_PTY_WORKER_ARGS: JSON.stringify([assetgenWorker]),
  });
  const ressources = packagedCommand(runtimeRoot, workRoot, "ressources.js", {
    RESSOURCES_SCHEMAS_ROOT: path.join(resourcesRoot, "schemas"),
  });
  const tester = packagedCommand(runtimeRoot, workRoot, "tester.js", {
    PLAYWRIGHT_BROWSERS_PATH: browserRoot,
  });

  return {
    mode: "packaged",
    repoRoot: null,
    runtimeRoot,
    workRoot,
    resourcesRoot,
    skillsRoot: path.join(options.userDataPath, "skills"),
    terminalCwd: options.homePath,
    assetgen,
    ressources,
    tester,
    requiredPaths: [
      path.join(runtimeRoot, "manifest.json"),
      assetgen.command,
      ...assetgen.argsPrefix,
      assetgenWorker,
      ...ressources.argsPrefix,
      ...tester.argsPrefix,
      path.join(runtimeRoot, "node_modules"),
      resourcesRoot,
      browserRoot,
    ],
  };
}

export function missingToolingRuntimePaths(
  runtime: ToolingRuntime,
  pathExists: (candidate: string) => boolean = fs.existsSync,
): string[] {
  return runtime.requiredPaths.filter((candidate) => !pathExists(candidate));
}
