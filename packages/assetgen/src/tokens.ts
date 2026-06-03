// `assetgen tokens` — compile lore/DESIGN.md into generated, banner-stamped
// artifacts. The DESIGN.md `assetgen:` block + palette are the SINGLE source of
// truth; this emits:
//   - packages/assetgen/src/style.generated.ts  (asset-gen: suffix, framing,
//     negatives, grade, provider settings, buildPrompt — consumed by style.ts)
//   - packages/assets/tokens/tokens.ts           (COLORS 0xRRGGBB + FONTS, Three.js)
//   - packages/assets/tokens/theme.css           (Tailwind v4 @theme)
//   - packages/assets/tokens/tokens.css          (:root vars)
// `--check` regenerates in memory and diffs the committed files (drift gate).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // packages/assetgen/src
const ROOT = join(here, "..", "..", ".."); // monorepo root (shipshitgames/)

/** Resolve the CANONICAL DESIGN.md — the lore one, never the stale monorepo copy. */
export function resolveDesignPath(override?: string): string {
  const candidates = [
    override,
    join(ROOT, ".agents/lore/DESIGN.md"), // submodule (preferred once wired)
    join(ROOT, "..", "lore", "DESIGN.md"), // sibling repo (current workspace layout)
    join(ROOT, "DESIGN.md"), // stale local copy — last resort
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`DESIGN.md not found (tried: ${candidates.join(", ")}). Pass --design <path>.`);
}

function frontmatter(text: string): any {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error("DESIGN.md has no YAML frontmatter");
  return (Bun as any).YAML.parse(m[1]);
}

/** Resolve {tokens.X} / {colors.X} placeholders against the palette, recursively. */
function deepResolve(v: any, colors: Record<string, string>): any {
  if (typeof v === "string")
    return v.replace(/\{(?:tokens|colors)\.([A-Za-z0-9]+)\}/g, (_, k) => colors[k] ?? `{${k}?}`);
  if (Array.isArray(v)) return v.map((x) => deepResolve(x, colors));
  if (v && typeof v === "object") {
    const o: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) o[k] = deepResolve(val, colors);
    return o;
  }
  return v;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const fold = (s: string) => s.replace(/\s+/g, " ").trim(); // collapse folded-scalar whitespace
const banner = (v: string, h: string, open = "/*", close = "*/") =>
  `${open} GENERATED FROM lore/DESIGN.md v${v} hash:${h} — DO NOT EDIT. Run: bun assetgen tokens ${close}\n`;

export interface TokensResult {
  drift: boolean;
  files: string[];
}

export async function runTokens(
  opts: { check?: boolean; design?: string; log?: (m: string) => void } = {},
): Promise<TokensResult> {
  const log = opts.log ?? (() => {});
  const designPath = resolveDesignPath(opts.design);
  const design = frontmatter(await readFile(designPath, "utf8"));
  const colors: Record<string, string> = design.colors ?? {};
  const version: string = String(design.version ?? "0.0.0");
  const ag = deepResolve(design.assetgen ?? {}, colors);
  const hash = (Bun as any)
    .hash(JSON.stringify({ version, colors, typography: design.typography, assetgen: ag }))
    .toString(16)
    .slice(0, 8);

  log(`[tokens] source: ${relative(ROOT, designPath)} (v${version} hash:${hash})`);

  // ── style.generated.ts (the asset-gen half — the Style-Bible bridge) ──────────
  const styleGen =
    banner(version, hash) +
    `// Asset-generation style, compiled from the DESIGN.md \`assetgen:\` block + the\n` +
    `// lore Style-Bible. style.ts re-exports these; edit the bible, not this file.\n\n` +
    `export const STYLE_SUFFIX = ${JSON.stringify(fold(ag.styleSuffix ?? ""))};\n\n` +
    `export const NEGATIVE_PROMPTS: string[] = ${JSON.stringify(ag.negativePrompts ?? [], null, 2)};\n\n` +
    `export const GAME_FRAMING: Record<string, string> = ${JSON.stringify(ag.perGameFraming ?? {}, null, 2)};\n\n` +
    `export const KIND_MAP: Record<string, string> = ${JSON.stringify(ag.kindMap ?? {}, null, 2)};\n\n` +
    `export const SCOURGE_RULE = { pattern: /${ag.scourgeRule?.trigger ?? "\\bscourge\\b"}/${ag.scourgeRule?.flags ?? "i"}, clause: ${JSON.stringify(fold(ag.scourgeRule?.clause ?? ""))} };\n\n` +
    `export const GRADE_PARAMS = ${JSON.stringify(ag.gradeParams ?? {}, null, 2)} as const;\n\n` +
    `export const STYLE_REF: Record<string, string> = ${JSON.stringify(ag.referenceImages ?? {}, null, 2)};\n\n` +
    `export const PROVIDER_SETTINGS = ${JSON.stringify(ag.providers ?? {}, null, 2)} as const;\n\n` +
    `/** Compose a generation prompt — mirrors DESIGN.md assetgen.promptTemplate. */\n` +
    `export function buildPrompt(opts: { prompt: string; game: string; kind: string }): string {\n` +
    `  const framing = GAME_FRAMING[opts.game] ?? GAME_FRAMING.shared;\n` +
    `  const kind = KIND_MAP[opts.kind] ?? opts.kind;\n` +
    `  const scourge = SCOURGE_RULE.pattern.test(opts.prompt) ? SCOURGE_RULE.clause : "";\n` +
    `  const parts = [opts.prompt, kind, framing, STYLE_SUFFIX];\n` +
    `  if (scourge) parts.push(scourge);\n` +
    `  return parts.join(". ") + ".";\n` +
    `}\n`;

  // ── token artifacts (palette → Three.js / Tailwind / CSS) ─────────────────────
  const typ = design.typography ?? {};
  const tokensTs =
    banner(version, hash) +
    `// Design tokens for imperative Three.js + TS. Hex ints for THREE.Color.\n\n` +
    `export const COLORS = {\n` +
    Object.entries(colors)
      .map(([k, hex]) => `  ${k}: 0x${String(hex).replace(/^#/, "")},`)
      .join("\n") +
    `\n} as const;\n\n` +
    `export const FONTS = {\n` +
    `  display: ${JSON.stringify(typ.display?.fontFamily ?? "")},\n` +
    `  body: ${JSON.stringify(typ.body?.fontFamily ?? "")},\n` +
    `  mono: ${JSON.stringify(typ.mono?.fontFamily ?? "")},\n` +
    `} as const;\n`;

  const themeCss =
    banner(version, hash) +
    `@theme {\n` +
    Object.entries(colors)
      .map(([k, hex]) => `  --color-${kebab(k)}: ${hex};`)
      .join("\n") +
    `\n  --font-display: ${typ.display?.fontFamily ?? ""};` +
    `\n  --font-body: ${typ.body?.fontFamily ?? ""};` +
    `\n  --font-mono: ${typ.mono?.fontFamily ?? ""};` +
    `\n}\n`;

  const tokensCss =
    banner(version, hash) +
    `:root {\n` +
    Object.entries(colors)
      .map(([k, hex]) => `  --${kebab(k)}: ${hex};`)
      .join("\n") +
    `\n  --font-display: ${typ.display?.fontFamily ?? ""};` +
    `\n  --font-body: ${typ.body?.fontFamily ?? ""};` +
    `\n  --font-mono: ${typ.mono?.fontFamily ?? ""};` +
    `\n}\n`;

  const outputs: Record<string, string> = {
    [join(here, "style.generated.ts")]: styleGen,
    [join(ROOT, "packages/assets/tokens/tokens.ts")]: tokensTs,
    [join(ROOT, "packages/assets/tokens/theme.css")]: themeCss,
    [join(ROOT, "packages/assets/tokens/tokens.css")]: tokensCss,
  };

  let drift = false;
  for (const [path, content] of Object.entries(outputs)) {
    const rel = relative(ROOT, path);
    const current = existsSync(path) ? await readFile(path, "utf8") : "";
    if (current === content) {
      log(`[tokens] ok   ${rel}`);
      continue;
    }
    if (opts.check) {
      drift = true;
      log(`[tokens] DRIFT ${rel} — run 'bun assetgen tokens'`);
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      log(`[tokens] wrote ${rel}`);
    }
  }
  if (opts.check && !drift) log(`[tokens] all artifacts current ✓`);
  return { drift, files: Object.keys(outputs) };
}
