// End-to-end coverage for the real `assetgen ingest-docs` CLI (#260).
//
// Each test builds a throwaway PROJECT root on disk (DESIGN.md + a game doc +
// a packages/assets catalog with an on-disk rendered variant), drives the
// command as a subprocess, and asserts the --json contract + the human report.
// Everything is sourced from fixtures — no sibling repo, no network, no clock,
// no randomness (dates are fixed literals).
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(pkgDir, "src", "cli.ts");

const GAME = "scourge-survivors"; // the slug the catalog + game doc are scoped to

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

/** Write a tiny real .webp at `<root>/<rel>` (the on-disk rendered variant). */
async function writeWebp(root: string, rel: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  const webp = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .webp()
    .toBuffer();
  await writeFile(full, webp);
}

const DESIGN_MD = [
  "---",
  "version: 3",
  "name: Scourge Survivors",
  "genre: roguelite",
  "---",
  "",
  "# Scourge Survivors",
  "",
  "Top-level design doc for the franchise.",
  "",
].join("\n");

// The game doc carries the structured headings the engine distills, plus
// wiki-links to one catalog entity (the Husk) and one doc-only entity (Reliquary).
const GAME_MD = [
  "---",
  `game: ${GAME}`,
  "genre: roguelite",
  "---",
  "",
  "# Scourge Survivors",
  "",
  "## Core Loop",
  "",
  "Dodge the swarm, harvest essence, level up, repeat until the horde overruns you.",
  "",
  "## V1 Format",
  "",
  "- One arena with escalating waves",
  "- Three unlockable weapons",
  "- A boss at the ten-minute mark",
  "",
  "## Win Condition",
  "",
  "Survive ten minutes and defeat the [[Husk]] champion guarding the [[Reliquary]].",
  "",
].join("\n");

/**
 * Build a temp PROJECT root. By default it ships:
 *  - DESIGN.md (version + name + genre frontmatter)
 *  - apps/lore/content/Games/<Game>.md (game doc with Core Loop / V1 / Win)
 *  - packages/assets/assets-catalog.json with three entities:
 *      husk     — in this game's games[], rendered variant present on disk
 *      ossuary  — in this game's games[], variant=null (a gap)
 *      stranger — NOT in this game's games[] (must be filtered out)
 *    plus the husk's webp on disk so present>=1.
 */
async function projectRoot(
  opts: { withCatalog?: boolean; withDocs?: boolean } = {},
): Promise<string> {
  const { withCatalog = true, withDocs = true } = opts;
  const root = await mkdtemp(join(tmpdir(), "assetgen-ingestdocs-e2e-"));

  if (withDocs) {
    await writeFile(join(root, "DESIGN.md"), DESIGN_MD);
    const gamesDir = join(root, "apps", "lore", "content", "Games");
    await mkdir(gamesDir, { recursive: true });
    await writeFile(join(gamesDir, "Scourge Survivors.md"), GAME_MD);
  }

  if (withCatalog) {
    const huskVariant = `games/${GAME}/husk.webp`;
    const catalog = {
      entities: [
        {
          id: "husk",
          kind: "enemy",
          name: "Husk",
          games: [GAME],
          variants: { [GAME]: huskVariant },
        },
        {
          id: "ossuary",
          kind: "enemy",
          name: "Ossuary",
          games: [GAME],
          variants: { [GAME]: null },
        },
        {
          id: "stranger",
          kind: "enemy",
          name: "Stranger",
          games: ["some-other-game"],
          variants: { "some-other-game": "games/some-other-game/stranger.webp" },
        },
      ],
      shared: [],
    };
    const assetsDir = join(root, "packages", "assets");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify(catalog, null, 2));
    // The husk's rendered variant must exist on disk to count as present.
    await writeWebp(assetsDir, huskVariant);
  }

  return root;
}

type Ctx = {
  project: string;
  game: string | null;
  hasContext: boolean;
  design: {
    genre: string | null;
    coreLoop: string | null;
    mvpRequirements: string[];
    winCondition: string | null;
  };
  entities: { id: string; name: string; inCatalog: boolean; referencedBy: string[] }[];
  assetRequirements: { kind: string; required: number; present: number; missing: number }[];
  sources: { source: string; path: string; found: boolean; count: number; note?: string }[];
};

test("e2e: --json emits the full Build Plan context for a populated project (exit 0)", async () => {
  const root = await projectRoot();
  try {
    const res = await spawnCli(["ingest-docs", "--root", root, "--game", GAME, "--json"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    const ctx = JSON.parse(res.stdout) as Ctx;
    assert.equal(ctx.hasContext, true);

    // Design metadata distilled from the game doc.
    assert.equal(ctx.design.genre, "roguelite");
    assert.notEqual(ctx.design.coreLoop, null);
    assert.ok(ctx.design.mvpRequirements.length > 0, "expected V1 Format bullets");
    assert.notEqual(ctx.design.winCondition, null);

    // Entity graph: in-catalog Husk + doc-only Reliquary; filtered-out Stranger absent.
    const husk = ctx.entities.find((e) => e.id === "husk");
    assert.ok(husk, "husk must be present");
    assert.equal(husk?.inCatalog, true);

    const reliquary = ctx.entities.find((e) => e.id === "reliquary");
    assert.ok(reliquary, "the doc-only [[Reliquary]] wiki-link must surface");
    assert.equal(reliquary?.inCatalog, false);

    assert.equal(
      ctx.entities.find((e) => e.id === "stranger"),
      undefined,
      "the out-of-game entity must be filtered out",
    );

    // Asset requirements: husk present, ossuary missing.
    const present = ctx.assetRequirements.reduce((n, r) => n + r.present, 0);
    const missing = ctx.assetRequirements.reduce((n, r) => n + r.missing, 0);
    assert.ok(present >= 1, `expected present>=1, got ${present}`);
    assert.ok(missing >= 1, `expected missing>=1, got ${missing}`);

    // Sources: the catalog is found with its full entity count.
    const catalog = ctx.sources.find((s) => s.source === "catalog");
    assert.equal(catalog?.found, true);
    assert.equal(catalog?.count, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: human output prints the [ingest-docs] report and not raw JSON (exit 0)", async () => {
  const root = await projectRoot();
  try {
    const res = await spawnCli(["ingest-docs", "--root", root, "--game", GAME]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    assert.match(res.stdout, /\[ingest-docs\]/);
    assert.match(res.stdout, new RegExp(`game ${GAME}`));
    assert.match(res.stdout, /FOUND\s+catalog/);
    assert.match(res.stdout, /FOUND\s+design/);

    // The machine report must not leak into the human path.
    assert.doesNotMatch(res.stdout, /"hasContext"/);
    assert.throws(() => JSON.parse(res.stdout), "human output must not be valid JSON");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: an empty root degrades gracefully (exit 0, no context)", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-ingestdocs-e2e-empty-"));
  try {
    const res = await spawnCli(["ingest-docs", "--root", root, "--game", "ghost", "--json"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    const ctx = JSON.parse(res.stdout) as Ctx;
    assert.equal(ctx.hasContext, false);
    assert.deepEqual(ctx.entities, []);
    assert.deepEqual(ctx.assetRequirements, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("e2e: docs without a catalog yield doc-only entities and no asset requirements (exit 0)", async () => {
  const root = await projectRoot({ withCatalog: false });
  try {
    const res = await spawnCli(["ingest-docs", "--root", root, "--game", GAME, "--json"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    const ctx = JSON.parse(res.stdout) as Ctx;
    assert.equal(ctx.hasContext, true);

    // No catalog -> every entity is a doc-only wiki-link.
    assert.ok(ctx.entities.length > 0, "expected the doc wiki-links to surface");
    assert.ok(
      ctx.entities.every((e) => e.inCatalog === false),
      "without a catalog no entity can be in-catalog",
    );
    assert.ok(
      ctx.entities.some((e) => e.id === "husk"),
      "the [[Husk]] wiki-link is doc-only here",
    );

    // No catalog -> no per-kind asset requirements.
    assert.deepEqual(ctx.assetRequirements, []);

    const catalog = ctx.sources.find((s) => s.source === "catalog");
    assert.equal(catalog?.found, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
