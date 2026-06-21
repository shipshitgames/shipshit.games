// Build Plan engine — doc-ingestion core (#260, part of #257).
//
// Reads a selected project's design/lore docs (DESIGN.md, game design docs,
// lore content) and distills them into the structured context the gap-map +
// worklist consume: a project's core loop, MVP/V1 requirements, entity
// dependencies, and per-type asset requirements.
//
// This is the PURE core: it only reads the filesystem (node:fs/promises +
// existsSync) and parses strings. It NEVER prints and NEVER calls
// process.exit — `commands/ingest-docs.ts` owns presentation. Every input is
// guarded so missing/empty docs degrade gracefully (fall back to the catalog +
// disk check) and NEVER throw. The markdown parsing is generic: no hardcoded
// game names or IP-specific assumptions, so it works for any future franchise.
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocKind = "design" | "game" | "lore" | "other";

export interface MarkdownSection {
  /** Heading text; "" for the preamble before the first heading. */
  heading: string;
  /** ATX heading depth (1–6); 0 for the preamble. */
  depth: number;
  /** Section body, trimmed. */
  body: string;
}

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  /** First H1, else string frontmatter title/name, else "". */
  title: string;
  sections: MarkdownSection[];
  /** Distinct wiki-link targets in first-seen order (alias/#anchor/.md stripped, trimmed). */
  wikiLinks: string[];
}

export interface IngestedDoc {
  /** Project-relative posix path. */
  path: string;
  kind: DocKind;
  frontmatter: Record<string, unknown>;
  title: string;
  wikiLinks: string[];
}

export interface DesignMetadata {
  title: string | null;
  genre: string | null;
  coreLoop: string | null;
  mvpRequirements: string[];
  winCondition: string | null;
  problem: string | null;
  goal: string | null;
}

export interface EntityDependency {
  /** Catalog id when matched, else slug(reference). */
  id: string;
  name: string;
  inCatalog: boolean;
  /** Project-relative doc paths that reference it, sorted + deduped. */
  referencedBy: string[];
}

export interface AssetRequirement {
  kind: string;
  required: number;
  present: number;
  missing: number;
  /** Sorted ids of the missing/unrendered assets. */
  missingIds: string[];
}

export type DocSourceKind = "design" | "lore" | "catalog";

export interface DocSourceStatus {
  source: DocSourceKind;
  path: string;
  found: boolean;
  count: number;
  note?: string;
}

export interface ProjectDocContext {
  project: string;
  game: string | null;
  design: DesignMetadata;
  docs: IngestedDoc[];
  entities: EntityDependency[];
  assetRequirements: AssetRequirement[];
  sources: DocSourceStatus[];
  hasContext: boolean;
}

export interface IngestOptions {
  root: string;
  projectId?: string;
  /**
   * Game to scope to. Accepts either a slug ("scourge-survivors") or a display
   * name ("Scourge Survivors") — it is slugified internally so it always matches
   * the catalog's slug-keyed `games`/`variants`. `ProjectDocContext.game` echoes
   * the resolved slug.
   */
  game?: string;
  designPath?: string;
  loreDirs?: string[];
  catalogPath?: string;
  assetsDir?: string;
}

export interface CatalogEntity {
  id: string;
  kind?: string;
  name?: string;
  faction?: string | null;
  games?: string[];
  variants?: Record<string, string | null>;
}

export interface AssetsCatalog {
  entities?: CatalogEntity[];
  shared?: unknown[];
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/** lowercase; collapse any run of non-[a-z0-9] into "-"; trim leading/trailing "-". */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/** Normalize a heading for synonym matching: lowercase, strip trailing ":"/ws, collapse spaces. */
function normalizeHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[:\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Frontmatter + markdown parsing
// ---------------------------------------------------------------------------

/**
 * Split YAML frontmatter from the body. When the text opens with a `---` fence
 * and has a closing `---` line, the inner block is YAML-parsed (Bun.YAML cast,
 * since it is absent from @types/bun). On a parse throw or a non-object result
 * the frontmatter degrades to {}. With no fence, frontmatter is {} and the body
 * is the whole text. NEVER throws.
 */
export function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!/^---\r?\n/.test(text)) return { frontmatter: {}, body: text };

  const close = text.match(/\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!close || close.index === undefined) return { frontmatter: {}, body: text };

  const openLen = text.match(/^---\r?\n/)![0].length;
  const inner = text.slice(openLen, close.index);
  const body = text.slice(close.index + close[0].length).replace(/^\s+/, "");

  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = (Bun as unknown as { YAML: { parse(input: string): unknown } }).YAML.parse(inner);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    frontmatter = {};
  }
  return { frontmatter, body };
}

/**
 * Distinct Obsidian wiki-link targets ([[Target]], [[Target|alias]],
 * [[Target#anchor]], [[Target.md]]) in first-seen order. Alias, anchor, and a
 * trailing `.md` are stripped; each target is trimmed; empties are skipped.
 */
export function extractWikiLinks(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let target = m[1] ?? "";
    const pipe = target.indexOf("|");
    if (pipe >= 0) target = target.slice(0, pipe);
    const hash = target.indexOf("#");
    if (hash >= 0) target = target.slice(0, hash);
    target = target.trim().replace(/\.md$/i, "").trim();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}

/**
 * Split a markdown body into sections by ATX heading, ignoring headings inside
 * fenced code blocks. The preamble before the first heading is
 * {heading:"",depth:0,body}; it is dropped when its trimmed body is empty.
 * Heading sections are always kept, even with empty bodies. Bodies are trimmed.
 */
export function splitSections(body: string): MarkdownSection[] {
  const lines = body.split("\n");
  const sections: MarkdownSection[] = [];

  let current: { heading: string; depth: number; lines: string[] } = { heading: "", depth: 0, lines: [] };
  let inCode = false;

  const flush = () => {
    const trimmed = current.lines.join("\n").trim();
    if (current.depth === 0 && current.heading === "" && trimmed === "") return; // drop empty preamble
    sections.push({ heading: current.heading, depth: current.depth, body: trimmed });
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode;
      current.lines.push(line);
      continue;
    }
    const headingMatch = inCode ? null : line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      flush();
      current = { heading: headingMatch[2]!.trim(), depth: headingMatch[1]!.length, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  return sections;
}

/** Bullet lines (`- ` / `* `) -> trimmed capture, in order. Non-bullets ignored. */
export function extractBullets(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*[-*]\s+(.+)/);
    if (m) out.push(m[1]!.trim());
  }
  return out;
}

/**
 * Parse a markdown document into frontmatter, title, sections, and wiki-links.
 * Title = first H1 text, else string frontmatter title/name, else "".
 */
export function parseMarkdown(text: string): ParsedMarkdown {
  const { frontmatter, body } = parseFrontmatter(text);
  const sections = splitSections(body);

  let title = "";
  const h1 = sections.find((s) => s.depth === 1);
  if (h1) {
    title = h1.heading;
  } else if (typeof frontmatter.title === "string" && frontmatter.title) {
    title = frontmatter.title;
  } else if (typeof frontmatter.name === "string" && frontmatter.name) {
    title = frontmatter.name;
  }

  return { frontmatter, title, sections, wikiLinks: extractWikiLinks(text) };
}

/**
 * Classify a doc by path + frontmatter. A basename of DESIGN.md is "design";
 * a frontmatter.type containing "game" or a "Games" path segment is "game";
 * a "/lore/" or "/content/" path is "lore"; everything else is "other".
 */
export function classifyDoc(relPath: string, frontmatter: Record<string, unknown>): DocKind {
  const posix = toPosix(relPath);
  const segments = posix.split("/");
  const base = segments[segments.length - 1] ?? "";

  if (base === "DESIGN.md") return "design";

  const type = typeof frontmatter.type === "string" ? frontmatter.type.toLowerCase() : "";
  if (type.includes("game") || segments.includes("Games")) return "game";

  if (posix.includes("/lore/") || posix.includes("/content/")) return "lore";
  return "other";
}

// ---------------------------------------------------------------------------
// Design metadata extraction
// ---------------------------------------------------------------------------

const SYNONYMS = {
  coreLoop: ["core loop", "gameplay loop", "core gameplay", "game loop", "core game loop", "loop"],
  mvp: [
    "mvp",
    "v1 format",
    "v1 scope",
    "v1 target",
    "v1",
    "scope",
    "mvp scope",
    "mvp slice",
    "minimum viable product",
    "first ship",
  ],
  winCondition: ["win condition", "win conditions", "victory", "lose condition", "loss condition", "win/lose"],
  problem: ["problem"],
  goal: ["goal", "goals"],
} as const;

/** First section whose normalized heading equals a synonym or starts with `synonym + " "`. */
function matchSection(sections: MarkdownSection[], synonyms: readonly string[]): MarkdownSection | null {
  for (const section of sections) {
    if (section.depth === 0) continue;
    const norm = normalizeHeading(section.heading);
    for (const syn of synonyms) {
      if (norm === syn || norm.startsWith(`${syn} `)) return section;
    }
  }
  return null;
}

/**
 * Distill the structured design metadata from the primary parsed doc. Sections
 * are matched by normalized heading against the synonym tables. When `primary`
 * is null every field degrades to null/[]. `fallbackGenre` supplies the genre
 * when the primary doc lacks a frontmatter.genre (e.g. it comes from DESIGN.md).
 */
export function extractDesignMetadata(
  primary: ParsedMarkdown | null,
  fallbackGenre?: string | null,
): DesignMetadata {
  if (!primary) {
    return {
      title: null,
      genre: fallbackGenre ?? null,
      coreLoop: null,
      mvpRequirements: [],
      winCondition: null,
      problem: null,
      goal: null,
    };
  }

  const { sections, frontmatter } = primary;
  const coreLoop = matchSection(sections, SYNONYMS.coreLoop);
  const mvp = matchSection(sections, SYNONYMS.mvp);
  const winCondition = matchSection(sections, SYNONYMS.winCondition);
  const problem = matchSection(sections, SYNONYMS.problem);
  const goal = matchSection(sections, SYNONYMS.goal);

  const fmGenre = typeof frontmatter.genre === "string" && frontmatter.genre ? frontmatter.genre : null;
  const fmTitle =
    typeof frontmatter.title === "string" && frontmatter.title
      ? frontmatter.title
      : typeof frontmatter.name === "string" && frontmatter.name
        ? frontmatter.name
        : null;

  return {
    title: primary.title || fmTitle || null,
    genre: fmGenre ?? fallbackGenre ?? null,
    coreLoop: coreLoop ? coreLoop.body || null : null,
    mvpRequirements: mvp ? extractBullets(mvp.body) : [],
    winCondition: winCondition ? winCondition.body || null : null,
    problem: problem ? problem.body || null : null,
    goal: goal ? goal.body || null : null,
  };
}

// ---------------------------------------------------------------------------
// Entity dependencies + asset requirements
// ---------------------------------------------------------------------------

/** Entities the catalog scopes to `game` (or all entities when game is null). */
function scopedEntities(catalog: AssetsCatalog | null, game: string | null): CatalogEntity[] {
  const entities = catalog?.entities ?? [];
  if (game === null) return entities;
  return entities.filter((e) => Array.isArray(e.games) && e.games.includes(game));
}

/**
 * Cross-reference doc wiki-links against the catalog to build the entity
 * dependency graph. Catalog entities (scoped to `game`) seed the list as
 * in-catalog deps; a wiki-link that resolves (by id or name-slug) appends its
 * doc path to that dep, otherwise it becomes a doc-only dep. Each referencedBy
 * is deduped + sorted; duplicate ids are merged; the result is sorted by id.
 */
export function buildEntityDependencies(
  docs: { path: string; wikiLinks: string[] }[],
  catalog: AssetsCatalog | null,
  game: string | null,
): EntityDependency[] {
  const inScope = scopedEntities(catalog, game);

  // Lookup: catalog id AND slug(name) -> entity, so links match either form.
  const lookup = new Map<string, CatalogEntity>();
  for (const e of inScope) {
    lookup.set(e.id, e);
    lookup.set(slugify(e.id), e);
    if (typeof e.name === "string" && e.name) lookup.set(slugify(e.name), e);
  }

  const deps = new Map<string, { id: string; name: string; inCatalog: boolean; referencedBy: Set<string> }>();

  // Seed from the in-scope catalog entities.
  for (const e of inScope) {
    if (!deps.has(e.id)) {
      deps.set(e.id, {
        id: e.id,
        name: typeof e.name === "string" && e.name ? e.name : e.id,
        inCatalog: true,
        referencedBy: new Set<string>(),
      });
    }
  }

  for (const doc of docs) {
    for (const link of doc.wikiLinks) {
      const linkSlug = slugify(link);
      const matched = lookup.get(link) ?? lookup.get(linkSlug);
      if (matched) {
        const dep = deps.get(matched.id);
        if (dep) dep.referencedBy.add(doc.path);
      } else {
        const existing = deps.get(linkSlug);
        if (existing) {
          existing.referencedBy.add(doc.path);
        } else {
          deps.set(linkSlug, {
            id: linkSlug,
            name: link,
            inCatalog: false,
            referencedBy: new Set<string>([doc.path]),
          });
        }
      }
    }
  }

  return [...deps.values()]
    .map((d) => ({
      id: d.id,
      name: d.name,
      inCatalog: d.inCatalog,
      referencedBy: [...d.referencedBy].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Per-asset-kind requirements derived from the catalog's variant map for
 * `game`: a null/undefined variant is a gap (unrendered), a string variant is
 * present (or a broken render when `assetsDir` is set and the file is absent on
 * disk). Only meaningful with a non-null game + a catalog; else returns [].
 */
export async function buildAssetRequirements(
  catalog: AssetsCatalog | null,
  game: string | null,
  assetsDir?: string,
): Promise<AssetRequirement[]> {
  if (game === null || !catalog?.entities || catalog.entities.length === 0) return [];

  const inScope = scopedEntities(catalog, game);
  const byKind = new Map<string, { required: number; present: number; missingIds: string[] }>();

  for (const e of inScope) {
    const kind = typeof e.kind === "string" && e.kind ? e.kind : "entity";
    const bucket = byKind.get(kind) ?? { required: 0, present: 0, missingIds: [] };
    bucket.required += 1;

    const variant = e.variants?.[game];
    let present: boolean;
    if (variant === null || variant === undefined) {
      present = false;
    } else if (typeof variant === "string") {
      present = assetsDir ? existsSync(join(assetsDir, variant)) : true;
    } else {
      present = false;
    }

    if (present) bucket.present += 1;
    else bucket.missingIds.push(e.id);

    byKind.set(kind, bucket);
  }

  return [...byKind.entries()]
    .map(([kind, b]) => ({
      kind,
      required: b.required,
      present: b.present,
      missing: b.required - b.present,
      missingIds: [...b.missingIds].sort(),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

// ---------------------------------------------------------------------------
// Filesystem entry points
// ---------------------------------------------------------------------------

/** Read + JSON-parse the assets catalog; null on a missing file or invalid JSON. Never throws. */
export async function readCatalog(catalogPath: string): Promise<AssetsCatalog | null> {
  if (!existsSync(catalogPath)) return null;
  try {
    const parsed = JSON.parse(await readFile(catalogPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AssetsCatalog;
  } catch {
    return null;
  }
}

const SCAN_SKIP = new Set(["node_modules", ".git", ".obsidian", "dist"]);

/** Recursively collect *.md files under `dir`, skipping vendor/build dirs. Never throws. */
async function collectMarkdown(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SCAN_SKIP.has(entry.name)) continue;
      await collectMarkdown(full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
}

/** Read a file as UTF-8; null on any error (missing/unreadable). Never throws. */
async function readTextSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Ingest a project's design/lore docs into the structured Build Plan context.
 * Resolves DESIGN.md + lore dirs, scans for the selected game's docs, distills
 * design metadata, cross-references entities against the catalog, and computes
 * per-kind asset requirements. Every fs read is guarded, so a missing root just
 * yields found:false everywhere and hasContext:false — it NEVER throws.
 */
export async function ingestProjectDocs(opts: IngestOptions): Promise<ProjectDocContext> {
  const { root } = opts;
  // Slugify the game once at the entry point so catalog scoping (whose `games`
  // arrays and `variants` keys are slugs) matches whether the caller passes a
  // slug or a display name. Without this, a value like "Scourge Survivors" would
  // silently scope to nothing. Mirrors the slugified lore-scan match below.
  const game = opts.game ? slugify(opts.game) : null;
  const project = opts.projectId ?? "unknown";

  // 1. Resolve + parse DESIGN.md.
  const designCandidates =
    opts.designPath && existsSync(opts.designPath)
      ? [opts.designPath]
      : [join(root, "DESIGN.md"), join(root, "lore", "DESIGN.md"), join(root, ".agents", "lore", "DESIGN.md")];
  const resolvedDesign = designCandidates.find((c) => existsSync(c)) ?? designCandidates[0]!;
  const designFound = existsSync(resolvedDesign);

  let designDoc: ParsedMarkdown | null = null;
  if (designFound) {
    const text = await readTextSafe(resolvedDesign);
    if (text !== null) designDoc = parseMarkdown(text);
  }

  // 2. Resolve lore dirs.
  const loreDirs = (
    opts.loreDirs ?? [join(root, "apps", "lore", "content"), join(root, "lore"), join(root, "docs")]
  ).filter((d) => existsSync(d));

  // 3. Game doc(s): scan lore dirs for the selected game's docs (only when a game is set).
  const gameDocs: { path: string; parsed: ParsedMarkdown }[] = [];
  if (game !== null) {
    const mdFiles: string[] = [];
    for (const dir of loreDirs) await collectMarkdown(dir, mdFiles);
    mdFiles.sort();
    for (const file of mdFiles) {
      const text = await readTextSafe(file);
      if (text === null) continue;
      const parsed = parseMarkdown(text);
      const fmGame = typeof parsed.frontmatter.game === "string" ? slugify(parsed.frontmatter.game) : "";
      const fmMode = typeof parsed.frontmatter.mode === "string" ? slugify(parsed.frontmatter.mode) : "";
      const fileSlug = slugify((file.split(sep).pop() ?? "").replace(/\.md$/i, ""));
      if (fmGame === game || fmMode === game || fileSlug === game) {
        gameDocs.push({ path: file, parsed });
      }
    }
  }

  // 4. Build the ingested-doc list (design doc + game docs).
  const docs: IngestedDoc[] = [];
  if (designDoc) {
    const relPath = toPosix(relative(root, resolvedDesign));
    docs.push({
      path: relPath,
      kind: classifyDoc(relPath, designDoc.frontmatter),
      frontmatter: designDoc.frontmatter,
      title: designDoc.title,
      wikiLinks: designDoc.wikiLinks,
    });
  }
  for (const { path, parsed } of gameDocs) {
    const relPath = toPosix(relative(root, path));
    docs.push({
      path: relPath,
      kind: classifyDoc(relPath, parsed.frontmatter),
      frontmatter: parsed.frontmatter,
      title: parsed.title,
      wikiLinks: parsed.wikiLinks,
    });
  }

  // 5. Distill design metadata. Prefer the canonical game doc (e.g.
  // `Games/<Game>.md`, or `frontmatter.type: game`) over an incidental filename
  // match, and source the genre from whichever doc declares one — so a genre on
  // the game doc is honoured even when it is not the alphabetically-first match.
  const isGameDoc = (d: { path: string; parsed: ParsedMarkdown }): boolean =>
    /(^|\/)games\//i.test(toPosix(relative(root, d.path))) || d.parsed.frontmatter.type === "game";
  const rankedGameDocs = [...gameDocs].sort((a, b) => Number(isGameDoc(b)) - Number(isGameDoc(a)));
  const primaryDoc = game !== null ? (rankedGameDocs[0]?.parsed ?? null) : designDoc;
  const genreDoc = [...rankedGameDocs.map((d) => d.parsed), designDoc].find(
    (d): d is ParsedMarkdown => !!d && typeof d.frontmatter.genre === "string" && !!d.frontmatter.genre,
  );
  const fallbackGenre = genreDoc ? (genreDoc.frontmatter.genre as string) : null;
  const design = extractDesignMetadata(primaryDoc, fallbackGenre);

  // 6. Catalog + asset requirements.
  const catalogPath =
    opts.catalogPath ?? join(opts.assetsDir ?? join(root, "packages", "assets"), "assets-catalog.json");
  const assetsDirForDisk = opts.assetsDir ?? dirname(catalogPath);
  const catalog = await readCatalog(catalogPath);

  const entities = buildEntityDependencies(
    docs.map((d) => ({ path: d.path, wikiLinks: d.wikiLinks })),
    catalog,
    game,
  );
  const assetRequirements = await buildAssetRequirements(catalog, game, assetsDirForDisk);

  // 7. Source statuses.
  const sources: DocSourceStatus[] = [
    {
      source: "design",
      path: toPosix(relative(root, resolvedDesign)) || resolvedDesign,
      found: designFound,
      // Count what was actually ingested, not just what exists on disk: a
      // DESIGN.md that resolves but cannot be read (e.g. it is a directory)
      // stays out of `docs`, so the count must reflect that.
      count: docs.filter((d) => d.kind === "design").length,
    },
    {
      source: "lore",
      path: loreDirs.length > 0 ? loreDirs.map((d) => toPosix(relative(root, d)) || d).join(",") : "(none)",
      found: gameDocs.length > 0,
      count: gameDocs.length,
      ...(game === null ? { note: "no --game selected; lore scan skipped" } : {}),
    },
    {
      source: "catalog",
      path: catalogPath,
      found: catalog !== null,
      count: catalog?.entities?.length ?? 0,
    },
  ];

  const hasContext = sources.some((s) => s.found);

  return { project, game, design, docs, entities, assetRequirements, sources, hasContext };
}
