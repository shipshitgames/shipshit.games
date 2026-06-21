import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(pkgDir, "src", "cli.ts");

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function run(args: string[], cwd: string): Promise<RunResult> {
  const env: Record<string, string | undefined> = { ...process.env, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" };
  // isolate from any real registry selection in the dev environment
  delete env.ASSETGEN_IP;
  delete env.ASSETGEN_PROJECT_ROOT;
  delete env.ASSETGEN_PROJECTS;
  const proc = Bun.spawn(["bun", cliPath, "build-plan", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function makeProject(): Promise<{ root: string; assetsDir: string; skillsDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "assetgen-buildplan-"));
  await writeFile(
    join(root, "DESIGN.md"),
    "---\ngenre: horde shooter\n---\n\n# Scourge\n\n## Core Loop\n\nSurvive escalating waves of the Scourge.\n",
  );

  const assetsDir = join(root, "packages", "assets");
  await mkdir(assetsDir, { recursive: true });
  const catalog = {
    version: "1",
    entities: [
      {
        id: "scourge-swarm",
        name: "Scourge Swarm",
        kind: "enemy",
        faction: "scourge",
        games: ["scourge-survivors"],
        variants: { "scourge-survivors": null },
      },
    ],
  };
  await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify(catalog));

  const skillsDir = join(root, "skills");
  const skill = join(skillsDir, "build-horde-shooter-game");
  await mkdir(skill, { recursive: true });
  const blueprint = {
    gameType: "horde-shooter",
    genreAliases: ["horde shooter"],
    assetClasses: [{ category: "sprite", items: ["player", "enemies"], mvp: true }],
    mvpSlice: ["player", "enemies"],
  };
  await writeFile(join(skill, "blueprint.json"), JSON.stringify(blueprint));

  return { root, assetsDir, skillsDir };
}

test("e2e: build-plan produces an MVP-ordered plan with the blueprint matched", async () => {
  const { root, assetsDir, skillsDir } = await makeProject();
  try {
    const res = await run(
      ["--game", "scourge-survivors", "--root", root, "--assets-dir", assetsDir, "--skills-dir", skillsDir, "--json"],
      root,
    );
    assert.equal(res.exitCode, 0, res.stderr);
    const plan = JSON.parse(res.stdout);
    assert.equal(plan.game, "scourge-survivors");
    assert.equal(plan.blueprint, "horde-shooter");
    assert.equal(plan.summary.blueprintMatched, true);
    assert.ok(plan.summary.missing >= 1, "expected at least one missing variant");
    assert.equal(plan.worklist[0].assetType, "sprite");
    assert.equal(plan.worklist[0].status, "missing");
    assert.equal(plan.worklist[0].mvp, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: a missing catalog exits non-zero with a clear message", async () => {
  const empty = await mkdtemp(join(tmpdir(), "assetgen-buildplan-empty-"));
  try {
    const res = await run(
      ["--game", "scourge-survivors", "--root", empty, "--assets-dir", join(empty, "packages", "assets")],
      empty,
    );
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /no assets-catalog\.json|not a valid asset catalog/);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});
