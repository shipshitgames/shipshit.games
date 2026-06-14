import { basename, extname, join } from "node:path";
import { importAseprite } from "../import-aseprite.ts";
import { parseAnchor } from "../sprites.ts";
import { flag, has, intFlag, numberFlag } from "./args.ts";
import { defaultRepo } from "./paths.ts";

export async function runImportAseprite(argv: string[]): Promise<void> {
  const sheetPath = flag(argv, "in");
  const jsonPath = flag(argv, "json");
  if (!sheetPath || !jsonPath) {
    printImportUsage();
    process.exit(1);
  }

  const game = flag(argv, "game", "shared")!;
  const id = flag(argv, "id") || slugFromPath(sheetPath);
  const defaultClip = flag(argv, "clip");
  const pixelize = has(argv, "pixelize");
  const height = intFlag(argv, "height", 110);
  // --fps is opt-in: omitted, the Aseprite per-frame durations drive timing.
  const fps = has(argv, "fps") ? intFlag(argv, "fps", 8) : undefined;
  const anchor = parseAnchor(flag(argv, "anchor"));
  const scale = numberFlag(argv, "scale", 1);
  const provider = flag(argv, "provider", "aseprite")!;
  const model = flag(argv, "model");
  const repo = flag(argv, "repo") || defaultRepo(game);
  const outputRoot = flag(argv, "out") || join(repo, "src/assets");
  const usageLog = flag(argv, "usage-log");
  const licenseType = flag(argv, "license-type");
  const licenseTerms = flag(argv, "license");
  const licenseUrl = flag(argv, "license-url");
  const dryRun = has(argv, "dry-run");

  console.log(`[assetgen] import provider=${provider}${model ? ` model=${model}` : ""} game=${game} id=${id}`);
  console.log(`[import] sheet=${sheetPath} json=${jsonPath}${pixelize ? " pixelize" : ""}${fps ? ` fps=${fps}` : ""}`);

  await importAseprite({
    id,
    game,
    sheetPath,
    jsonPath,
    defaultClip,
    pixelize,
    height,
    anchor,
    scale,
    fps,
    provider,
    model,
    outputRoot,
    usageLogPath: usageLog,
    licenseType,
    licenseTerms,
    licenseUrl,
    dryRun,
    log: (chunk) => process.stdout.write(chunk),
  });
}

function slugFromPath(p: string): string {
  return basename(p, extname(p)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "sprite";
}

function printImportUsage(): void {
  console.error(
    "usage:\n" +
      "  assetgen import-aseprite --in <sheet.png> --json <sheet.json>\n" +
      "           [--id <id>] [--game <slug>|shared] [--clip <name>] [--pixelize] [--height 110]\n" +
      "           [--fps <n>] [--anchor 0.5,1] [--scale 1] [--provider aseprite] [--model <model>]\n" +
      "           [--repo <game-repo-path>] [--out <assets-root>] [--usage-log <path|off>]\n" +
      "           [--license-type <type>] [--license <terms>] [--license-url <url>] [--dry-run]\n" +
      "\n  Imports a hand-authored Aseprite sheet (PNG + 'Output > JSON Data') into a sprite-anim\n" +
      "  entry — one clip per frame-tag, indistinguishable in format from an expand-generated one.\n" +
      "  Tag names map to clips; an optional facing suffix (run_west, idle_se) splits direction.\n" +
      "  Omit --fps to honor the Aseprite per-frame durations; --pixelize re-grades onto the DOOM grid.",
  );
}
