import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type AssetsCatalog,
  buildAssetRequirements,
  buildEntityDependencies,
  classifyDoc,
  extractBullets,
  extractDesignMetadata,
  extractWikiLinks,
  ingestProjectDocs,
  parseFrontmatter,
  parseMarkdown,
  slugify,
  splitSections,
} from "./doc-ingestion.ts";

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

test("slugify lowercases, collapses non-alphanumerics, and trims edges", () => {
  assert.equal(slugify("The Wretch"), "the-wretch");
  assert.equal(slugify("UPPER CASE"), "upper-case");
  assert.equal(slugify("  leading and trailing  "), "leading-and-trailing");
  assert.equal(slugify("Acid! Bath?? (rotten)"), "acid-bath-rotten");
  assert.equal(slugify("multiple   spaces"), "multiple-spaces");
  assert.equal(slugify("---edge---"), "edge");
  assert.equal(slugify("snake_case mix"), "snake-case-mix");
  assert.equal(slugify("a/b\\c.d"), "a-b-c-d");
  assert.equal(slugify("already-slug"), "already-slug");
  assert.equal(slugify("!!!"), "");
});

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

test("parseFrontmatter parses valid YAML frontmatter and preserves the body", () => {
  const text = "---\ntitle: Hello\ngenre: survival\n---\n# Heading\n\nbody text\n";
  const { frontmatter, body } = parseFrontmatter(text);
  assert.equal(frontmatter.title, "Hello");
  assert.equal(frontmatter.genre, "survival");
  assert.equal(body, "# Heading\n\nbody text\n");
});

test("parseFrontmatter returns {} and whole text when there is no frontmatter", () => {
  const text = "# Just a heading\n\nno frontmatter here\n";
  const { frontmatter, body } = parseFrontmatter(text);
  assert.deepEqual(frontmatter, {});
  assert.equal(body, text);
});

test("parseFrontmatter handles CRLF line endings", () => {
  const text = "---\r\ntitle: Win\r\ngenre: roguelike\r\n---\r\n# Body\r\n\r\ncontent\r\n";
  const { frontmatter, body } = parseFrontmatter(text);
  assert.equal(frontmatter.title, "Win");
  assert.equal(frontmatter.genre, "roguelike");
  assert.equal(body, "# Body\r\n\r\ncontent\r\n");
});

test("parseFrontmatter degrades malformed YAML to {} while keeping the body", () => {
  // Unbalanced bracket / bad indentation should make Bun.YAML throw or yield a non-object.
  const text = "---\n: : : not: valid: yaml: [\n---\n# Real Body\n\nstill here\n";
  const { frontmatter, body } = parseFrontmatter(text);
  assert.deepEqual(frontmatter, {});
  assert.equal(body, "# Real Body\n\nstill here\n");
});

test("parseFrontmatter degrades a non-object YAML (scalar/array) to {}", () => {
  const text = "---\n- just\n- a\n- list\n---\nbody\n";
  const { frontmatter, body } = parseFrontmatter(text);
  assert.deepEqual(frontmatter, {});
  assert.equal(body, "body\n");
});

// ---------------------------------------------------------------------------
// extractWikiLinks
// ---------------------------------------------------------------------------

test("extractWikiLinks strips alias, anchor, trailing .md and dedupes in order", () => {
  const text = [
    "Reference [[The Wretch|the wretch]] then [[Acid Bath#stats]].",
    "Also [[Lore Doc.md]] and again [[The Wretch]] (dup).",
    "Two on one line: [[Alpha]] and [[Beta]].",
  ].join("\n");
  assert.deepEqual(extractWikiLinks(text), ["The Wretch", "Acid Bath", "Lore Doc", "Alpha", "Beta"]);
});

test("extractWikiLinks returns [] when there are no wiki-links", () => {
  assert.deepEqual(extractWikiLinks("plain text with [a markdown](link) and no wiki links"), []);
});

test("extractWikiLinks trims whitespace inside the brackets and skips empties", () => {
  assert.deepEqual(extractWikiLinks("[[  Spaced Name  ]] and [[|onlyalias]] and [[#onlyanchor]]"), [
    "Spaced Name",
  ]);
});

// ---------------------------------------------------------------------------
// splitSections
// ---------------------------------------------------------------------------

test("splitSections splits preamble + headings of varying depth and trims bodies", () => {
  const body = [
    "preamble line one",
    "preamble line two",
    "# Top",
    "top body",
    "## Sub",
    "sub body",
    "### Deep",
    "deep body",
  ].join("\n");
  const sections = splitSections(body);
  assert.deepEqual(sections, [
    { heading: "", depth: 0, body: "preamble line one\npreamble line two" },
    { heading: "Top", depth: 1, body: "top body" },
    { heading: "Sub", depth: 2, body: "sub body" },
    { heading: "Deep", depth: 3, body: "deep body" },
  ]);
});

test("splitSections ignores a '#' line inside a fenced code block", () => {
  const body = [
    "# Real Heading",
    "before code",
    "```bash",
    "# not a heading, just a comment",
    "echo hi",
    "```",
    "after code",
  ].join("\n");
  const sections = splitSections(body);
  assert.equal(sections.length, 1);
  assert.equal(sections[0]!.heading, "Real Heading");
  assert.equal(sections[0]!.depth, 1);
  assert.ok(sections[0]!.body.includes("# not a heading, just a comment"));
  assert.ok(sections[0]!.body.includes("```bash"));
});

test("splitSections keeps an empty-body heading and drops an empty preamble", () => {
  const body = ["# Empty Section", "", "## Filled", "has content"].join("\n");
  const sections = splitSections(body);
  assert.deepEqual(sections, [
    { heading: "Empty Section", depth: 1, body: "" },
    { heading: "Filled", depth: 2, body: "has content" },
  ]);
});

test("splitSections keeps a trailing section at end of body", () => {
  const body = ["# A", "abody", "# B", "bbody"].join("\n");
  const sections = splitSections(body);
  assert.equal(sections.length, 2);
  assert.equal(sections[1]!.heading, "B");
  assert.equal(sections[1]!.body, "bbody");
});

// ---------------------------------------------------------------------------
// extractBullets
// ---------------------------------------------------------------------------

test("extractBullets captures - and * bullets including indented, ignoring paragraphs", () => {
  const body = [
    "intro paragraph, not a bullet",
    "- first item",
    "* second item",
    "  - indented item",
    "    * deeply indented",
    "not-a-bullet-line",
    "-no space after dash",
  ].join("\n");
  assert.deepEqual(extractBullets(body), ["first item", "second item", "indented item", "deeply indented"]);
});

test("extractBullets returns [] when there are no bullets", () => {
  assert.deepEqual(extractBullets("just\nplain\nprose"), []);
});

// ---------------------------------------------------------------------------
// parseMarkdown — title precedence
// ---------------------------------------------------------------------------

test("parseMarkdown title precedence: H1 wins over frontmatter.title", () => {
  const text = "---\ntitle: FM Title\nname: FM Name\n---\n# H1 Title\n\nbody\n";
  const parsed = parseMarkdown(text);
  assert.equal(parsed.title, "H1 Title");
});

test("parseMarkdown title falls back to frontmatter.title when no H1", () => {
  const text = "---\ntitle: FM Title\nname: FM Name\n---\n## Only a Sub\n\nbody\n";
  const parsed = parseMarkdown(text);
  assert.equal(parsed.title, "FM Title");
});

test("parseMarkdown title falls back to frontmatter.name when no H1 and no title", () => {
  const text = "---\nname: FM Name\n---\n## Sub\n\nbody\n";
  const parsed = parseMarkdown(text);
  assert.equal(parsed.title, "FM Name");
});

test("parseMarkdown title is '' when no H1, title, or name", () => {
  const text = "## Sub only\n\nbody with [[Link]]\n";
  const parsed = parseMarkdown(text);
  assert.equal(parsed.title, "");
  assert.deepEqual(parsed.wikiLinks, ["Link"]);
});

// ---------------------------------------------------------------------------
// classifyDoc
// ---------------------------------------------------------------------------

test("classifyDoc identifies DESIGN.md as design", () => {
  assert.equal(classifyDoc("DESIGN.md", {}), "design");
  assert.equal(classifyDoc("lore/DESIGN.md", {}), "design");
});

test("classifyDoc identifies a Games/ path or game frontmatter type as game", () => {
  assert.equal(classifyDoc("lore/Games/Scavenge.md", {}), "game");
  assert.equal(classifyDoc("docs/whatever.md", { type: "Game Design" }), "game");
});

test("classifyDoc identifies a lore/content doc as lore", () => {
  assert.equal(classifyDoc("apps/lore/content/factions/raiders.md", {}), "lore");
  assert.equal(classifyDoc("project/lore/the-wretch.md", {}), "lore");
  assert.equal(classifyDoc("apps/content/zones/swamp.md", {}), "lore");
});

test("classifyDoc falls back to other", () => {
  assert.equal(classifyDoc("README.md", {}), "other");
  assert.equal(classifyDoc("docs/setup.md", {}), "other");
});

// ---------------------------------------------------------------------------
// extractDesignMetadata
// ---------------------------------------------------------------------------

test("extractDesignMetadata distills a synthetic game doc's fields", () => {
  const text = [
    "---",
    "genre: survival-horror",
    "---",
    "# Scavenge Mode",
    "",
    "## Problem",
    "Players have nothing to do at night.",
    "",
    "## Goal",
    "Give a tense night loop.",
    "",
    "## Core Loop",
    "Scavenge, craft, survive, repeat.",
    "",
    "## V1 Format",
    "- One map",
    "- Three enemies",
    "- A crafting bench",
    "",
    "## Win Condition",
    "Survive seven nights.",
  ].join("\n");
  const parsed = parseMarkdown(text);
  const meta = extractDesignMetadata(parsed);
  assert.equal(meta.title, "Scavenge Mode");
  assert.equal(meta.genre, "survival-horror");
  assert.equal(meta.coreLoop, "Scavenge, craft, survive, repeat.");
  assert.deepEqual(meta.mvpRequirements, ["One map", "Three enemies", "A crafting bench"]);
  assert.equal(meta.winCondition, "Survive seven nights.");
  assert.equal(meta.problem, "Players have nothing to do at night.");
  assert.equal(meta.goal, "Give a tense night loop.");
});

test("extractDesignMetadata uses fallbackGenre when the doc has no frontmatter.genre", () => {
  const parsed = parseMarkdown("# Mode\n\n## Core Loop\nloop body\n");
  const meta = extractDesignMetadata(parsed, "action-rpg");
  assert.equal(meta.genre, "action-rpg");
  assert.equal(meta.coreLoop, "loop body");
});

test("extractDesignMetadata prefers the doc's own frontmatter.genre over fallbackGenre", () => {
  const parsed = parseMarkdown("---\ngenre: doc-genre\n---\n# Mode\n");
  const meta = extractDesignMetadata(parsed, "fallback-genre");
  assert.equal(meta.genre, "doc-genre");
});

test("extractDesignMetadata returns all null/[] when primary is null", () => {
  const meta = extractDesignMetadata(null);
  assert.deepEqual(meta, {
    title: null,
    genre: null,
    coreLoop: null,
    mvpRequirements: [],
    winCondition: null,
    problem: null,
    goal: null,
  });
});

test("extractDesignMetadata null primary still honors fallbackGenre", () => {
  const meta = extractDesignMetadata(null, "from-design");
  assert.equal(meta.genre, "from-design");
  assert.equal(meta.title, null);
  assert.deepEqual(meta.mvpRequirements, []);
});

test("extractDesignMetadata yields null/[] for sections that are absent", () => {
  const parsed = parseMarkdown("# Lonely\n\nno recognized sections here\n");
  const meta = extractDesignMetadata(parsed);
  assert.equal(meta.coreLoop, null);
  assert.deepEqual(meta.mvpRequirements, []);
  assert.equal(meta.winCondition, null);
  assert.equal(meta.problem, null);
  assert.equal(meta.goal, null);
});

// ---------------------------------------------------------------------------
// buildEntityDependencies
// ---------------------------------------------------------------------------

function sampleCatalog(): AssetsCatalog {
  return {
    entities: [
      { id: "the-wretch", kind: "enemy", name: "The Wretch", games: ["scavenge"] },
      { id: "acid-bath", kind: "hazard", name: "Acid Bath", games: ["scavenge"] },
      { id: "off-game-boss", kind: "enemy", name: "Off Game Boss", games: ["other-mode"] },
    ],
  };
}

test("buildEntityDependencies matches by entity id and by name-slug, dedupes referencedBy", () => {
  const catalog = sampleCatalog();
  const docs = [
    { path: "lore/Games/Scavenge.md", wikiLinks: ["the-wretch", "Acid Bath", "the-wretch"] },
    { path: "lore/extra.md", wikiLinks: ["The Wretch"] },
  ];
  const deps = buildEntityDependencies(docs, catalog, "scavenge");

  const wretch = deps.find((d) => d.id === "the-wretch");
  assert.ok(wretch);
  assert.equal(wretch.inCatalog, true);
  assert.equal(wretch.name, "The Wretch");
  // Matched by id ("the-wretch") in one doc and by name-slug ("The Wretch") in the other; deduped + sorted.
  assert.deepEqual(wretch.referencedBy, ["lore/Games/Scavenge.md", "lore/extra.md"]);

  const acid = deps.find((d) => d.id === "acid-bath");
  assert.ok(acid);
  assert.equal(acid.inCatalog, true);
  assert.deepEqual(acid.referencedBy, ["lore/Games/Scavenge.md"]);
});

test("buildEntityDependencies turns an unmatched wiki-link into a doc-only dep", () => {
  const catalog = sampleCatalog();
  const docs = [{ path: "lore/Games/Scavenge.md", wikiLinks: ["Mystery Creature"] }];
  const deps = buildEntityDependencies(docs, catalog, "scavenge");

  const mystery = deps.find((d) => d.id === "mystery-creature");
  assert.ok(mystery);
  assert.equal(mystery.inCatalog, false);
  assert.equal(mystery.name, "Mystery Creature");
  assert.deepEqual(mystery.referencedBy, ["lore/Games/Scavenge.md"]);
});

test("buildEntityDependencies merges repeated doc-only links and dedupes referencedBy", () => {
  const docs = [
    { path: "b.md", wikiLinks: ["Ghoul"] },
    { path: "a.md", wikiLinks: ["Ghoul"] },
    { path: "a.md", wikiLinks: ["Ghoul"] },
  ];
  const deps = buildEntityDependencies(docs, null, "scavenge");
  assert.equal(deps.length, 1);
  assert.equal(deps[0]!.id, "ghoul");
  assert.equal(deps[0]!.inCatalog, false);
  assert.deepEqual(deps[0]!.referencedBy, ["a.md", "b.md"]);
});

test("buildEntityDependencies game filter excludes entities not scoped to the game", () => {
  const catalog = sampleCatalog();
  const deps = buildEntityDependencies([], catalog, "scavenge");
  const ids = deps.map((d) => d.id);
  assert.ok(ids.includes("the-wretch"));
  assert.ok(ids.includes("acid-bath"));
  assert.ok(!ids.includes("off-game-boss"), "off-game-boss is scoped to other-mode, must be excluded");
});

test("buildEntityDependencies with a null game includes all catalog entities", () => {
  const catalog = sampleCatalog();
  const deps = buildEntityDependencies([], catalog, null);
  const ids = deps.map((d) => d.id);
  assert.deepEqual(ids, ["acid-bath", "off-game-boss", "the-wretch"]);
});

test("buildEntityDependencies result is sorted by id", () => {
  const catalog = sampleCatalog();
  const deps = buildEntityDependencies(
    [{ path: "z.md", wikiLinks: ["Zzz Entity", "Aaa Entity"] }],
    catalog,
    "scavenge",
  );
  const ids = deps.map((d) => d.id);
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(ids, sorted);
});

// ---------------------------------------------------------------------------
// buildAssetRequirements
// ---------------------------------------------------------------------------

test("buildAssetRequirements treats null variant as missing and aggregates per kind", async () => {
  const catalog: AssetsCatalog = {
    entities: [
      { id: "e1", kind: "enemy", games: ["g"], variants: { g: null } },
      { id: "e2", kind: "enemy", games: ["g"], variants: {} },
      { id: "h1", kind: "hazard", games: ["g"], variants: { g: null } },
    ],
  };
  const reqs = await buildAssetRequirements(catalog, "g");
  const enemy = reqs.find((r) => r.kind === "enemy");
  const hazard = reqs.find((r) => r.kind === "hazard");
  assert.ok(enemy && hazard);
  assert.equal(enemy.required, 2);
  assert.equal(enemy.present, 0);
  assert.equal(enemy.missing, 2);
  assert.deepEqual(enemy.missingIds, ["e1", "e2"]);
  assert.equal(hazard.required, 1);
  assert.equal(hazard.missing, 1);
  assert.deepEqual(hazard.missingIds, ["h1"]);
});

test("buildAssetRequirements with no assetsDir treats a string variant as present", async () => {
  const catalog: AssetsCatalog = {
    entities: [
      { id: "e1", kind: "enemy", games: ["g"], variants: { g: "renders/g/e1.webp" } },
      { id: "e2", kind: "enemy", games: ["g"], variants: { g: null } },
    ],
  };
  const reqs = await buildAssetRequirements(catalog, "g");
  const enemy = reqs.find((r) => r.kind === "enemy")!;
  assert.equal(enemy.required, 2);
  assert.equal(enemy.present, 1);
  assert.equal(enemy.missing, 1);
  assert.deepEqual(enemy.missingIds, ["e2"]);
});

test("buildAssetRequirements with assetsDir checks the file on disk (present vs broken)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetreq-"));
  try {
    await mkdir(join(dir, "renders", "g"), { recursive: true });
    await writeFile(join(dir, "renders", "g", "present.webp"), "fake-webp-bytes");

    const catalog: AssetsCatalog = {
      entities: [
        { id: "ok", kind: "enemy", games: ["g"], variants: { g: "renders/g/present.webp" } },
        { id: "broken", kind: "enemy", games: ["g"], variants: { g: "renders/g/absent.webp" } },
        { id: "unrendered", kind: "enemy", games: ["g"], variants: { g: null } },
      ],
    };
    const reqs = await buildAssetRequirements(catalog, "g", dir);
    const enemy = reqs.find((r) => r.kind === "enemy")!;
    assert.equal(enemy.required, 3);
    assert.equal(enemy.present, 1);
    assert.equal(enemy.missing, 2);
    // "broken" (string variant but no file) and "unrendered" (null) are both missing; sorted.
    assert.deepEqual(enemy.missingIds, ["broken", "unrendered"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildAssetRequirements defaults entity kind to 'entity' when absent", async () => {
  const catalog: AssetsCatalog = {
    entities: [{ id: "x", games: ["g"], variants: { g: null } }],
  };
  const reqs = await buildAssetRequirements(catalog, "g");
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.kind, "entity");
  assert.deepEqual(reqs[0]!.missingIds, ["x"]);
});

test("buildAssetRequirements returns [] for a null game or empty catalog", async () => {
  assert.deepEqual(await buildAssetRequirements(sampleCatalog(), null), []);
  assert.deepEqual(await buildAssetRequirements(null, "g"), []);
  assert.deepEqual(await buildAssetRequirements({ entities: [] }, "g"), []);
});

test("buildAssetRequirements result is sorted by kind", async () => {
  const catalog: AssetsCatalog = {
    entities: [
      { id: "z", kind: "zeta", games: ["g"], variants: { g: null } },
      { id: "a", kind: "alpha", games: ["g"], variants: { g: null } },
    ],
  };
  const reqs = await buildAssetRequirements(catalog, "g");
  assert.deepEqual(
    reqs.map((r) => r.kind),
    ["alpha", "zeta"],
  );
});

// ---------------------------------------------------------------------------
// ingestProjectDocs — integration (temp dir)
// ---------------------------------------------------------------------------

test("ingestProjectDocs integrates design + game doc + catalog + on-disk render", async () => {
  const root = await mkdtemp(join(tmpdir(), "ingest-"));
  try {
    // DESIGN.md with frontmatter version + genre.
    await writeFile(
      join(root, "DESIGN.md"),
      [
        "---",
        "title: Deadrot",
        "version: 2026-06-08",
        "genre: survival-horror",
        "---",
        "# Deadrot",
        "",
        "Top-level design doc.",
      ].join("\n"),
    );

    // lore/Games/<Game>.md — game doc with sections + wiki-links.
    await mkdir(join(root, "lore", "Games"), { recursive: true });
    await writeFile(
      join(root, "lore", "Games", "Scavenge.md"),
      [
        "---",
        "game: scavenge",
        "---",
        "# Scavenge Mode",
        "",
        "## Core Loop",
        "Loot, fight [[The Wretch]], escape.",
        "",
        "## V1 Format",
        "- One arena",
        "- Two enemies",
        "",
        "## Win Condition",
        "Reach the extraction point.",
        "",
        "## Notes",
        "Also references [[Mystery Creature]] which is doc-only.",
      ].join("\n"),
    );

    // packages/assets/assets-catalog.json + one rendered variant on disk.
    const assetsDir = join(root, "packages", "assets");
    await mkdir(join(assetsDir, "renders", "scavenge"), { recursive: true });
    await writeFile(join(assetsDir, "renders", "scavenge", "the-wretch.webp"), "fake-webp");
    const catalog: AssetsCatalog = {
      entities: [
        {
          id: "the-wretch",
          kind: "enemy",
          name: "The Wretch",
          games: ["scavenge"],
          variants: { scavenge: "renders/scavenge/the-wretch.webp" },
        },
        {
          id: "acid-bath",
          kind: "hazard",
          name: "Acid Bath",
          games: ["scavenge"],
          variants: { scavenge: null },
        },
      ],
    };
    await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify(catalog, null, 2));

    const ctx = await ingestProjectDocs({ root, game: "scavenge" });

    // hasContext + design metadata (primary = the game doc).
    assert.equal(ctx.hasContext, true);
    assert.equal(ctx.game, "scavenge");
    assert.equal(ctx.design.title, "Scavenge Mode");
    assert.equal(ctx.design.genre, "survival-horror"); // falls back from DESIGN.md frontmatter
    assert.equal(ctx.design.coreLoop, "Loot, fight [[The Wretch]], escape.");
    assert.deepEqual(ctx.design.mvpRequirements, ["One arena", "Two enemies"]);
    assert.equal(ctx.design.winCondition, "Reach the extraction point.");

    // Entities: in-catalog (the-wretch referenced + acid-bath seeded) + doc-only mystery-creature.
    const wretch = ctx.entities.find((e) => e.id === "the-wretch");
    const acid = ctx.entities.find((e) => e.id === "acid-bath");
    const mystery = ctx.entities.find((e) => e.id === "mystery-creature");
    assert.ok(wretch && acid && mystery);
    assert.equal(wretch.inCatalog, true);
    assert.deepEqual(wretch.referencedBy, ["lore/Games/Scavenge.md"]);
    assert.equal(acid.inCatalog, true);
    assert.equal(mystery.inCatalog, false);
    assert.deepEqual(mystery.referencedBy, ["lore/Games/Scavenge.md"]);

    // Asset requirements: one enemy present (on disk), one hazard missing.
    const enemy = ctx.assetRequirements.find((r) => r.kind === "enemy")!;
    const hazard = ctx.assetRequirements.find((r) => r.kind === "hazard")!;
    assert.equal(enemy.required, 1);
    assert.equal(enemy.present, 1);
    assert.equal(enemy.missing, 0);
    assert.equal(hazard.required, 1);
    assert.equal(hazard.present, 0);
    assert.deepEqual(hazard.missingIds, ["acid-bath"]);

    // Sources: all three found.
    const design = ctx.sources.find((s) => s.source === "design")!;
    const lore = ctx.sources.find((s) => s.source === "lore")!;
    const cat = ctx.sources.find((s) => s.source === "catalog")!;
    assert.equal(design.found, true);
    assert.equal(lore.found, true);
    assert.equal(lore.count, 1);
    assert.equal(cat.found, true);
    assert.equal(cat.count, 2);

    // Docs list carries both the design doc and the game doc.
    const paths = ctx.docs.map((d) => d.path).sort();
    assert.deepEqual(paths, ["DESIGN.md", "lore/Games/Scavenge.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ingestProjectDocs — graceful degradation
// ---------------------------------------------------------------------------

test("ingestProjectDocs on an empty root with a game -> no context, all null, no throw", async () => {
  const root = await mkdtemp(join(tmpdir(), "ingest-empty-"));
  try {
    const ctx = await ingestProjectDocs({ root, game: "scavenge" });
    assert.equal(ctx.hasContext, false);
    assert.equal(ctx.design.title, null);
    assert.equal(ctx.design.genre, null);
    assert.equal(ctx.design.coreLoop, null);
    assert.deepEqual(ctx.design.mvpRequirements, []);
    assert.equal(ctx.design.winCondition, null);
    assert.deepEqual(ctx.entities, []);
    assert.deepEqual(ctx.assetRequirements, []);
    assert.deepEqual(ctx.docs, []);
    for (const s of ctx.sources) assert.equal(s.found, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestProjectDocs with docs but NO catalog -> entities doc-only, assetRequirements [], no throw", async () => {
  const root = await mkdtemp(join(tmpdir(), "ingest-nocat-"));
  try {
    await mkdir(join(root, "lore", "Games"), { recursive: true });
    await writeFile(
      join(root, "lore", "Games", "Scavenge.md"),
      [
        "---",
        "game: scavenge",
        "genre: roguelike",
        "---",
        "# Scavenge Mode",
        "",
        "## Core Loop",
        "Delve and die. See [[The Wretch]].",
      ].join("\n"),
    );

    const ctx = await ingestProjectDocs({ root, game: "scavenge" });
    assert.equal(ctx.hasContext, true); // the lore doc was found
    assert.equal(ctx.design.coreLoop, "Delve and die. See [[The Wretch]].");
    assert.equal(ctx.design.genre, "roguelike");

    // No catalog -> the only entity is the doc-only wiki-link.
    assert.equal(ctx.entities.length, 1);
    assert.equal(ctx.entities[0]!.id, "the-wretch");
    assert.equal(ctx.entities[0]!.inCatalog, false);
    assert.deepEqual(ctx.assetRequirements, []);

    const cat = ctx.sources.find((s) => s.source === "catalog")!;
    assert.equal(cat.found, false);
    assert.equal(cat.count, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestProjectDocs parses a generic non-Deadrot IP (starhulk) correctly", async () => {
  const root = await mkdtemp(join(tmpdir(), "ingest-starhulk-"));
  try {
    await writeFile(
      join(root, "DESIGN.md"),
      ["---", "title: Starhulk", "genre: space-roguelike", "---", "# Starhulk", "", "An IP about derelict ships."].join(
        "\n",
      ),
    );

    await mkdir(join(root, "lore", "Games"), { recursive: true });
    await writeFile(
      join(root, "lore", "Games", "Salvage.md"),
      [
        "---",
        "game: salvage",
        "---",
        "# Salvage Run",
        "",
        "## Problem",
        "Drifting alone in the void.",
        "",
        "## Core Loop",
        "Board [[Hull Drone]], strip [[Reactor Core]], jump.",
        "",
        "## V1 Format",
        "- One derelict",
        "- Two drones",
      ].join("\n"),
    );

    const assetsDir = join(root, "packages", "assets");
    await mkdir(assetsDir, { recursive: true });
    const catalog: AssetsCatalog = {
      entities: [
        { id: "hull-drone", kind: "drone", name: "Hull Drone", games: ["salvage"], variants: { salvage: null } },
        { id: "reactor-core", kind: "prop", name: "Reactor Core", games: ["salvage"], variants: { salvage: null } },
        { id: "ignore-me", kind: "drone", name: "Ignore Me", games: ["other"], variants: { other: null } },
      ],
    };
    await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify(catalog));

    const ctx = await ingestProjectDocs({ root, game: "salvage" });
    assert.equal(ctx.hasContext, true);
    assert.equal(ctx.design.title, "Salvage Run");
    assert.equal(ctx.design.genre, "space-roguelike");
    assert.equal(ctx.design.problem, "Drifting alone in the void.");
    assert.deepEqual(ctx.design.mvpRequirements, ["One derelict", "Two drones"]);

    const ids = ctx.entities.map((e) => e.id);
    assert.ok(ids.includes("hull-drone"));
    assert.ok(ids.includes("reactor-core"));
    assert.ok(!ids.includes("ignore-me"), "entity scoped to another game must be excluded");

    const hull = ctx.entities.find((e) => e.id === "hull-drone")!;
    assert.equal(hull.inCatalog, true);
    assert.deepEqual(hull.referencedBy, ["lore/Games/Salvage.md"]);

    // Both in-scope entities are unrendered (null variant) -> drone+prop missing.
    const drone = ctx.assetRequirements.find((r) => r.kind === "drone")!;
    const prop = ctx.assetRequirements.find((r) => r.kind === "prop")!;
    assert.equal(drone.required, 1);
    assert.equal(drone.missing, 1);
    assert.equal(prop.required, 1);
    assert.equal(prop.missing, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestProjectDocs selects a game doc via the frontmatter.mode field", async () => {
  // A doc whose filename + frontmatter.game differ from the requested slug, but
  // whose `mode` matches (mirrors lore/Games/Bloodlane.md -> game: Pactfall, mode: bloodlane).
  const root = await mkdtemp(join(tmpdir(), "ingest-mode-"));
  try {
    await mkdir(join(root, "lore", "Games"), { recursive: true });
    await writeFile(
      join(root, "lore", "Games", "Bloodlane.md"),
      [
        "---",
        "game: Pactfall",
        "mode: bloodlane",
        "genre: one-lane MOBA",
        "---",
        "# Bloodlane",
        "",
        "## Win Condition",
        "Destroy the opposing base seal.",
      ].join("\n"),
    );

    const ctx = await ingestProjectDocs({ root, game: "bloodlane" });
    assert.equal(ctx.game, "bloodlane");
    assert.equal(ctx.design.title, "Bloodlane");
    assert.equal(ctx.design.genre, "one-lane MOBA"); // genre is read verbatim from the doc frontmatter
    assert.equal(ctx.design.winCondition, "Destroy the opposing base seal.");
    const lore = ctx.sources.find((s) => s.source === "lore")!;
    assert.equal(lore.count, 1);
    assert.deepEqual(
      ctx.docs.map((d) => d.path),
      ["lore/Games/Bloodlane.md"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestProjectDocs prefers the filename-matched Games/<Game>.md doc as the metadata primary", async () => {
  // Real-world shape (Deadrot): the canonical game doc lives at
  // apps/lore/content/Games/Scourge-Survivors.md and carries the genre, but it
  // has NO frontmatter.game — it matches only by its filename slug. A peripheral
  // UI-previs README under Art/ tags `game: Scourge-Survivors` and sorts FIRST
  // alphabetically (Art/ < Games/). The genre must still come from the real game
  // doc, not from the genre-less previs README that merely happens to sort first.
  const root = await mkdtemp(join(tmpdir(), "ingest-primary-"));
  try {
    const content = join(root, "apps", "lore", "content");

    // Peripheral doc: tags `game:` but carries no genre, sorts before Games/.
    const previsDir = join(content, "Art", "UI-Drafts", "2026-06-04-fps-hud-previs");
    await mkdir(previsDir, { recursive: true });
    await writeFile(
      join(previsDir, "README.md"),
      [
        "---",
        "type: buildable-ui-previs",
        "game: Scourge-Survivors",
        "---",
        "# Scourge Survivors FPS HUD Previs",
        "",
        "## Core Loop",
        "Wrong loop — this previs README must not become the primary.",
      ].join("\n"),
    );

    // Canonical game doc: matches ONLY by filename slug, carries the genre.
    const gamesDir = join(content, "Games");
    await mkdir(gamesDir, { recursive: true });
    await writeFile(
      join(gamesDir, "Scourge-Survivors.md"),
      [
        "---",
        "genre: first-person horde-survivors shooter (Vampire-Survivors × DOOM)",
        "faction: The Pyre",
        "---",
        "# Scourge Survivors",
        "",
        "## Core Loop",
        "Drop in, grind the Scourge, draft upgrades, push deeper until overrun.",
      ].join("\n"),
    );

    const ctx = await ingestProjectDocs({ root, game: "scourge-survivors" });

    assert.equal(ctx.game, "scourge-survivors");
    // Genre + title + core loop all come from the canonical Games/ doc, not the README.
    assert.match(ctx.design.genre ?? "", /survivors/i);
    assert.match(ctx.design.genre ?? "", /horde/i);
    assert.equal(ctx.design.title, "Scourge Survivors");
    assert.equal(
      ctx.design.coreLoop,
      "Drop in, grind the Scourge, draft upgrades, push deeper until overrun.",
    );

    // Both docs are still ingested (the previs README is a legitimate lore doc).
    const lore = ctx.sources.find((s) => s.source === "lore")!;
    assert.equal(lore.count, 2);
    const paths = ctx.docs.map((d) => d.path).sort();
    assert.deepEqual(paths, [
      "apps/lore/content/Art/UI-Drafts/2026-06-04-fps-hud-previs/README.md",
      "apps/lore/content/Games/Scourge-Survivors.md",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestProjectDocs falls back to a frontmatter-only game-doc match as the primary", async () => {
  // No doc's filename slugifies to the game slug (bySlug is false everywhere), but
  // one doc tags itself via frontmatter.game. The fallback (gameDocs[0]) must still
  // make it the metadata primary so its genre/core loop surface.
  const root = await mkdtemp(join(tmpdir(), "ingest-fallback-"));
  try {
    await mkdir(join(root, "lore", "Games"), { recursive: true });
    await writeFile(
      join(root, "lore", "Games", "Flagship.md"),
      [
        "---",
        "game: scourge-survivors",
        "genre: first-person horde shooter",
        "---",
        "# Flagship FPS",
        "",
        "## Core Loop",
        "Survive the swarm and push deeper.",
      ].join("\n"),
    );

    const ctx = await ingestProjectDocs({ root, game: "scourge-survivors" });
    assert.equal(ctx.game, "scourge-survivors");
    assert.equal(ctx.design.title, "Flagship FPS");
    assert.match(ctx.design.genre ?? "", /horde/i);
    assert.equal(ctx.design.coreLoop, "Survive the swarm and push deeper.");
    const lore = ctx.sources.find((s) => s.source === "lore")!;
    assert.equal(lore.count, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestProjectDocs slugifies a display-name game so catalog scoping still matches", async () => {
  // Passing "The Scavenge" (a display name) must resolve to the slug "the-scavenge"
  // and still scope the catalog, whose games/variants keys are slugs.
  const root = await mkdtemp(join(tmpdir(), "ingest-displayname-"));
  try {
    const assetsDir = join(root, "packages", "assets");
    await mkdir(assetsDir, { recursive: true });
    const catalog: AssetsCatalog = {
      entities: [
        { id: "ripper", kind: "enemy", name: "Ripper", games: ["the-scavenge"], variants: { "the-scavenge": null } },
      ],
    };
    await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify(catalog));

    const ctx = await ingestProjectDocs({ root, game: "The Scavenge" });
    assert.equal(ctx.game, "the-scavenge");
    const ripper = ctx.entities.find((e) => e.id === "ripper");
    assert.ok(ripper, "display-name game must still scope the catalog entity");
    const enemy = ctx.assetRequirements.find((r) => r.kind === "enemy")!;
    assert.equal(enemy.required, 1);
    assert.deepEqual(enemy.missingIds, ["ripper"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestProjectDocs falls back to a genre on any matched game doc when the canonical doc omits it", async () => {
  const root = await mkdtemp(join(tmpdir(), "ingest-genre-fallback-"));
  try {
    // Canonical Games/<Game>.md matches by filename slug (so it is the primary)
    // but declares NO genre.
    await mkdir(join(root, "lore", "Games"), { recursive: true });
    await writeFile(
      join(root, "lore", "Games", "Horde.md"),
      ["---", "faction: pyre", "---", "# Horde", "", "## Core Loop", "Survive the swarm."].join("\n"),
    );
    // A peripheral doc matches by frontmatter.game and DOES declare the genre.
    await mkdir(join(root, "lore", "Design"), { recursive: true });
    await writeFile(
      join(root, "lore", "Design", "Horde-Pitch.md"),
      ["---", "game: horde", "genre: wave shooter", "---", "# Pitch"].join("\n"),
    );

    const ctx = await ingestProjectDocs({ root, game: "horde" });
    assert.equal(ctx.design.title, "Horde"); // canonical Games/ doc stays primary
    assert.equal(ctx.design.coreLoop, "Survive the swarm.");
    assert.equal(ctx.design.genre, "wave shooter"); // genre sourced from the other matched doc
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
