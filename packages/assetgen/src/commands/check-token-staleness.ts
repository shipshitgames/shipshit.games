// `assetgen check-token-staleness` — the game prebuild staleness gate (#47).
//
// Fails (exit 1) when a vendored token consumer's banner version is behind the
// canon DESIGN.md version, so a stale vendored copy cannot survive a build. Wire
// it into a repo's `prebuild` script. Lightweight: it only parses banners + the
// DESIGN.md version, so a vendored game repo can run it without the generator.
import { checkTokenStaleness, failingResults, type StalenessReport } from "../token-staleness.ts";
import { flag, has } from "./args.ts";

/** Collect bare (non-flag, non-flag-value) positional args as file paths. */
function positionalFiles(argv: string[]): string[] {
  const valueFlags = new Set(["--design", "--canon", "--files"]);
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (valueFlags.has(arg)) {
      i++; // skip this flag's value
      continue;
    }
    if (arg.startsWith("--")) continue;
    files.push(arg);
  }
  return files;
}

export async function runCheckTokenStalenessCommand(argv: string[]): Promise<void> {
  const json = has(argv, "json");
  const design = flag(argv, "design");
  const canonVersion = flag(argv, "canon");
  const filesFlag = flag(argv, "files");
  const fromFlag = filesFlag ? filesFlag.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const positional = positionalFiles(argv);
  const files = [...fromFlag, ...positional];

  // A selector was supplied if `--files` or any positional was present. If it was
  // supplied but resolved to nothing (e.g. `--files " "`), fail loudly rather than
  // silently falling back to the monorepo default consumers — a vendored repo
  // would otherwise check paths it does not have, or the wrong ones.
  if ((has(argv, "files") || positional.length > 0) && files.length === 0) {
    console.error(
      "[token-staleness] a file selector was given but resolved to no file paths; " +
        "pass one or more paths, or omit --files to check the default consumers.",
    );
    process.exit(1);
  }

  let report: StalenessReport;
  try {
    report = await checkTokenStaleness({
      design,
      canonVersion,
      files: files.length > 0 ? files : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[token-staleness] ${message}`);
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const result of report.results) {
      const label = result.status.toUpperCase().padEnd(8);
      const version = result.version ? ` (v${result.version})` : "";
      console.log(`[token-staleness] ${label} ${result.file}${version}`);
    }
  }

  if (!report.ok) {
    const detail = failingResults(report)
      .map((r) => `${r.file} is ${r.status}${r.version ? ` at v${r.version}` : ""}`)
      .join("; ");
    console.error(
      `[token-staleness] vendored tokens are behind canon v${report.canonVersion}: ${detail}. ` +
        "Run 'bun assetgen tokens' (and re-sync vendored copies), then rebuild.",
    );
    process.exit(1);
  }

  if (!json) console.log(`[token-staleness] all consumers current with canon v${report.canonVersion}`);
}
