import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  missingToolingRuntimePaths,
  resolveToolingRuntime,
  TOOLING_RUNTIME_DIRECTORY,
} from "./tooling-runtime";

describe("resolveToolingRuntime", () => {
  test("development uses Bun with canonical workspace CLI entrypoints", () => {
    const runtime = resolveToolingRuntime({
      isPackaged: false,
      appPath: "/workspace/shipshitgames/apps/desktop",
      resourcesPath: "/unused",
      userDataPath: "/users/me/studio",
      homePath: "/users/me",
      hostExecutablePath: "/workspace/electron",
    });

    expect(runtime.mode).toBe("development");
    expect(runtime.repoRoot).toBe("/workspace/shipshitgames");
    expect(runtime.assetgen).toMatchObject({
      command: "bun",
      argsPrefix: ["/workspace/shipshitgames/packages/assetgen/src/cli.ts"],
      cwd: "/workspace/shipshitgames",
    });
    expect(runtime.ressources.argsPrefix).toEqual([
      "/workspace/shipshitgames/packages/ressources/src/cli.ts",
    ]);
    expect(runtime.tester.argsPrefix).toEqual([
      "/workspace/shipshitgames/packages/tester/src/cli.ts",
    ]);
  });

  test("packaged mode resolves only signed resources and writable user data", () => {
    const runtime = resolveToolingRuntime({
      isPackaged: true,
      appPath: "/Applications/Ship Shit Games Studio.app/Contents/Resources/app.asar",
      resourcesPath: "/Applications/Ship Shit Games Studio.app/Contents/Resources",
      userDataPath: "/users/me/Library/Application Support/Ship Shit Games Studio",
      homePath: "/users/me",
      hostExecutablePath:
        "/Applications/Ship Shit Games Studio.app/Contents/MacOS/Ship Shit Games Studio",
    });
    const packagedRoot = path.join(
      "/Applications/Ship Shit Games Studio.app/Contents/Resources",
      TOOLING_RUNTIME_DIRECTORY,
    );

    expect(runtime.mode).toBe("packaged");
    expect(runtime.repoRoot).toBeNull();
    expect(runtime.runtimeRoot).toBe(packagedRoot);
    expect(runtime.assetgen).toMatchObject({
      command: path.join(packagedRoot, "bin", "bun"),
      argsPrefix: [path.join(packagedRoot, "lib", "assetgen.js")],
    });
    expect(runtime.assetgen.env.ASSETGEN_PTY_WORKER).toBe(
      "/Applications/Ship Shit Games Studio.app/Contents/MacOS/Ship Shit Games Studio",
    );
    expect(JSON.parse(runtime.assetgen.env.ASSETGEN_PTY_WORKER_ARGS)).toEqual([
      path.join(packagedRoot, "lib", "assetgen-codex-pty.cjs"),
    ]);
    expect(runtime.assetgen.env.ASSETGEN_PTY_WORKER_ELECTRON_RUN_AS_NODE).toBe("1");
    expect(runtime.ressources).toMatchObject({
      command: path.join(packagedRoot, "bin", "bun"),
      argsPrefix: [path.join(packagedRoot, "lib", "ressources.js")],
    });
    expect(runtime.ressources.env.RESSOURCES_SCHEMAS_ROOT).toBe(
      path.join(packagedRoot, "ressources", "schemas"),
    );
    expect(runtime.tester.env.PLAYWRIGHT_BROWSERS_PATH).toBe(
      path.join(packagedRoot, "playwright-browsers"),
    );
    expect(runtime.workRoot).toContain("Application Support/Ship Shit Games Studio/tooling");
    expect(runtime.requiredPaths).toContain(path.join(packagedRoot, "node_modules"));
    expect(JSON.stringify(runtime)).not.toContain("/workspace/");
  });

  test("reports every missing required artifact without hiding partial packages", () => {
    const runtime = resolveToolingRuntime({
      isPackaged: true,
      appPath: "/app/app.asar",
      resourcesPath: "/app/resources",
      userDataPath: "/data",
      homePath: "/home",
      hostExecutablePath: "/app/Studio",
    });
    const present = new Set([runtime.assetgen.command, runtime.resourcesRoot]);

    expect(missingToolingRuntimePaths(runtime, (candidate) => present.has(candidate))).toEqual(
      runtime.requiredPaths.filter((candidate) => !present.has(candidate)),
    );
  });
});
