// `assetgen ingest-docs` — thin command over the doc-ingestion core (#260).
//
// Reads a selected project's design/lore docs and prints (or JSON-dumps) the
// structured Build Plan context the gap-map + worklist consume. This is a
// read/report command: it degrades gracefully (exit 0) even when nothing is
// found, and NEVER calls process.exit on the success path. All parsing +
// filesystem work lives in ../doc-ingestion.ts; this file owns presentation.
import { ingestProjectDocs } from "../doc-ingestion.ts";
import { flag, has } from "./args.ts";
import { selectedProject } from "./registry.ts";

export async function runIngestDocsCommand(argv: string[]): Promise<void> {
  const selected = selectedProject();
  const root = flag(argv, "root") || selected?.root || process.cwd();
  const projectId = flag(argv, "project") || selected?.id || "unknown";

  // `flag` returns the next token unconditionally, so reject a missing or
  // flag-shaped --game value rather than treating "--json" as the slug.
  const rawGame = flag(argv, "game");
  const game = !rawGame || rawGame.startsWith("--") ? undefined : rawGame;

  const design = flag(argv, "design");
  const catalog = flag(argv, "catalog");
  const assetsDir = flag(argv, "assets-dir");
  const lore = flag(argv, "lore");
  const loreDirs = lore ? [lore] : undefined;
  const json = has(argv, "json");

  const ctx = await ingestProjectDocs({
    root,
    projectId,
    game,
    designPath: design,
    catalogPath: catalog,
    assetsDir,
    loreDirs,
  });

  if (json) {
    console.log(JSON.stringify(ctx, null, 2));
    return;
  }

  const p = (line: string) => console.log(`[ingest-docs] ${line}`);

  p(`project ${ctx.project} — game ${ctx.game ?? "all"}`);

  for (const source of ctx.sources) {
    const status = source.found ? "FOUND" : "MISS";
    const note = source.note ? ` (${source.note})` : "";
    p(`${status.padEnd(5)} ${source.source} — ${source.path} [${source.count}]${note}`);
  }

  const d = ctx.design;
  p(`design genre=${d.genre ?? "?"} coreLoop=${d.coreLoop ? "yes" : "no"} mvp=${d.mvpRequirements.length} winCondition=${d.winCondition ? "yes" : "no"}`);

  const inCatalog = ctx.entities.filter((e) => e.inCatalog).length;
  const docOnly = ctx.entities.length - inCatalog;
  p(`entities ${ctx.entities.length} total (${inCatalog} in-catalog, ${docOnly} doc-only)`);

  if (ctx.assetRequirements.length === 0) {
    p("assets — no per-kind requirements (need --game + a catalog)");
  } else {
    for (const req of ctx.assetRequirements) {
      p(`assets ${req.kind} — required=${req.required} present=${req.present} missing=${req.missing}`);
    }
  }

  if (!ctx.hasContext) p("no docs or catalog found — falling back to catalog + check");
}
