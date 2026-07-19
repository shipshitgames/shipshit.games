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
  delete env.ASSETGEN_SKILLS_DIR;
  const proc = Bun.spawn(["bun", cliPath, "build-plan", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function makeProject(
  options: {
    genre?: string;
    game?: string;
    withFixtureBlueprint?: boolean;
  } = {},
): Promise<{ root: string; assetsDir: string; skillsDir: string }> {
  const {
    genre = "horde shooter",
    game = "scourge-survivors",
    withFixtureBlueprint = true,
  } = options;
  const root = await mkdtemp(join(tmpdir(), "assetgen-buildplan-"));
  await writeFile(
    join(root, "DESIGN.md"),
    `---\ngenre: ${genre}\n---\n\n# Fixture Game\n\n## Core Loop\n\nComplete the genre's primary objective.\n`,
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
        games: [game],
        variants: { [game]: null },
      },
    ],
  };
  await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify(catalog));

  const skillsDir = join(root, "skills");
  await mkdir(skillsDir, { recursive: true });
  if (withFixtureBlueprint) {
    // dir name is free-form — the blueprint is matched by its gameType/genreAliases,
    // so a real genre skill (e.g. fps-arena) carries the horde-shooter blueprint.
    const skill = join(skillsDir, "fps-arena");
    await mkdir(skill, { recursive: true });
    const blueprint = {
      gameType: "horde-shooter",
      genreAliases: ["horde shooter"],
      assetClasses: [{ category: "sprite", items: ["player", "enemies"], mvp: true }],
      mvpSlice: ["player", "enemies"],
    };
    await writeFile(join(skill, "blueprint.json"), JSON.stringify(blueprint));
  }

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

test("e2e: build-plan discovers the checked-in MOBA blueprint without --skills-dir", async () => {
  const { root, assetsDir } = await makeProject({
    genre: "one-lane moba",
    game: "pactfall",
    withFixtureBlueprint: false,
  });
  try {
    const res = await run(["--game", "pactfall", "--root", root, "--assets-dir", assetsDir, "--json"], root);
    assert.equal(res.exitCode, 0, res.stderr);
    const plan = JSON.parse(res.stdout);
    assert.equal(plan.game, "pactfall");
    assert.equal(plan.blueprint, "moba");
    assert.equal(plan.summary.blueprintMatched, true);
    assert.ok(plan.blueprintCoverage.some((row: { category: string }) => row.category === "ui"));
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
