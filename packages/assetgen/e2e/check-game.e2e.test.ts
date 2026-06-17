import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(pkgDir, "src", "cli.ts");

const GAME = "scourge-survivors"; // a real slug, so no "unknown game" warning muddies output

type CliResult = { exitCode: number; stdout: string; stderr: string };

async function spawnCli(verbArgs: string[]): Promise<CliResult> {
  const proc = Bun.spawn(["bun", cliPath, ...verbArgs], {
    cwd: pkgDir,
    env: { ...process.env, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function runCli(args: string[]): Promise<CliResult> {
  return spawnCli(["check", "--game", GAME, ...args]);
}

const LICENSE = { tool: "codex", plan: "gpt-image-1", date: "2026-06-17", kind: "sprite" };

function asset(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "sword", kind: "sprite", game: GAME, path: "sprites/sword.webp", license: { ...LICENSE }, ...over };
}

/** Build a `<root>/src/assets` tree and return the root to pass as `--root`. */
async function gameRepo(assets: unknown[], files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "assetgen-checkgame-e2e-"));
  const assetsRoot = join(root, "src", "assets");
  await mkdir(assetsRoot, { recursive: true });
  await writeFile(join(assetsRoot, "assets.json"), JSON.stringify({ assets }, null, 2));
  for (const f of files) {
    const full = join(assetsRoot, f);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, "webp-bytes");
  }
  return root;
}

test("e2e: a clean game repo passes every check (exit 0)", async () => {
  const root = await gameRepo(
    [asset({ id: "sword", path: "sprites/sword.webp" }), asset({ id: "shield", path: "sprites/shield.webp" })],
    ["sprites/sword.webp", "sprites/shield.webp"],
  );
  try {
    const res = await runCli(["--root", root, "--skip-codegen"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /OK\s+manifest-resolves/);
    assert.match(res.stdout, /OK\s+licensed/);
    assert.match(res.stdout, new RegExp(`${GAME} ok — all checks passed`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: an unresolved manifest reference fails the gate (exit 1)", async () => {
  const root = await gameRepo([asset({ id: "ghost", path: "sprites/ghost.webp" })], []);
  try {
    const res = await runCli(["--root", root, "--skip-codegen"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stdout, /FAIL\s+manifest-resolves/);
    assert.match(res.stderr, /failed: .*manifest-resolves/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: an unlicensed entry fails the gate (exit 1)", async () => {
  const root = await gameRepo(
    [asset({ id: "sword", path: "sprites/sword.webp", license: { ...LICENSE, date: "" } })],
    ["sprites/sword.webp"],
  );
  try {
    const res = await runCli(["--root", root, "--skip-codegen"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stdout, /FAIL\s+licensed/);
    assert.match(res.stdout, /missing license\.date/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: a Udio-sourced entry is denied (exit 1)", async () => {
  const root = await gameRepo(
    [asset({ id: "song", kind: "music", path: "music/song.webp", provider: "udio" })],
    ["music/song.webp"],
  );
  try {
    const res = await runCli(["--root", root, "--skip-codegen"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stdout, /FAIL\s+banned-source/);
    assert.match(res.stdout, /provider="udio" is a banned source/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: an orphan webp fails the gate (exit 1)", async () => {
  const root = await gameRepo(
    [asset({ id: "sword", path: "sprites/sword.webp" })],
    ["sprites/sword.webp", "sprites/orphan.webp"],
  );
  try {
    const res = await runCli(["--root", root, "--skip-codegen"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stdout, /FAIL\s+orphan-webps/);
    assert.match(res.stdout, /sprites\/orphan\.webp is not referenced/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: --json emits a machine report and still exits non-zero on failure", async () => {
  const root = await gameRepo([asset({ id: "ghost", path: "sprites/ghost.webp" })], []);
  try {
    const res = await runCli(["--root", root, "--skip-codegen", "--json"]);
    assert.equal(res.exitCode, 1);
    const report = JSON.parse(res.stdout) as {
      ok: boolean;
      game: string;
      results: { check: string; status: string }[];
    };
    assert.equal(report.ok, false);
    assert.equal(report.game, GAME);
    const resolves = report.results.find((r) => r.check === "manifest-resolves");
    assert.equal(resolves?.status, "fail");
    // The human summary stays out of stdout under --json.
    assert.doesNotMatch(res.stdout, /all checks passed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: a missing manifest fails the gate (exit 1)", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-checkgame-e2e-nomani-"));
  try {
    const res = await runCli(["--root", root, "--skip-codegen"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stdout, /no manifest at/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** Seed a real shared @shipshitgames/assets package (catalog + one game-tagged webp) under `dir`. */
async function seedSharedAssets(dir: string): Promise<string> {
  const assetsDir = join(dir, "shared-assets");
  const gameDir = join(assetsDir, "games", GAME);
  await mkdir(gameDir, { recursive: true });
  await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify({ entities: [], shared: [] }));
  const webp = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .webp()
    .toBuffer();
  await writeFile(join(gameDir, "husk.webp"), webp);
  return assetsDir;
}

test("e2e: codegen-current passes end-to-end after `assetgen codegen` writes the module (exit 0)", async () => {
  const root = await gameRepo([asset({ id: "sword", path: "sprites/sword.webp" })], ["sprites/sword.webp"]);
  try {
    const assetsDir = await seedSharedAssets(root);
    const out = join(root, "src", "assets.generated.ts");

    // Generate the module the check will rebuild and compare against.
    const gen = await spawnCli(["codegen", "--game", GAME, "--assets-dir", assetsDir, "--out", out]);
    assert.equal(gen.exitCode, 0, `codegen failed:\n${gen.stdout}\n${gen.stderr}`);

    const res = await runCli(["--root", root, "--assets-dir", assetsDir]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /OK\s+codegen-current/);
    assert.match(res.stdout, new RegExp(`${GAME} ok — all checks passed`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: codegen-current fails end-to-end when the generated module has drifted (exit 1)", async () => {
  const root = await gameRepo([asset({ id: "sword", path: "sprites/sword.webp" })], ["sprites/sword.webp"]);
  try {
    const assetsDir = await seedSharedAssets(root);
    const out = join(root, "src", "assets.generated.ts");
    const gen = await spawnCli(["codegen", "--game", GAME, "--assets-dir", assetsDir, "--out", out]);
    assert.equal(gen.exitCode, 0, `codegen failed:\n${gen.stdout}\n${gen.stderr}`);

    // Hand-edit the generated module so it no longer matches the built output.
    const drifted = `${await Bun.file(out).text()}// hand-edited drift\n`;
    await writeFile(out, drifted);

    const res = await runCli(["--root", root, "--assets-dir", assetsDir]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stdout, /FAIL\s+codegen-current/);
    assert.match(res.stdout, /is out of date/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
