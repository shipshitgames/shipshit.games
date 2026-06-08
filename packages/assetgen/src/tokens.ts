// `assetgen tokens` — compile lore/DESIGN.md into generated, banner-stamped
// artifacts. The DESIGN.md `assetgen:` block + palette are the SINGLE source of
// truth; this emits:
//   - packages/assetgen/src/style.generated.ts  (asset-gen: suffix, framing,
//     negatives, grade, provider settings, buildPrompt — consumed by style.ts)
//   - deadrotcom/packages/assets/tokens/tokens.ts (COLORS 0xRRGGBB + FONTS, Three.js)
//   - deadrotcom/packages/assets/tokens/tokens.json (portable token metadata)
//   - deadrotcom/packages/assets/tokens/theme.css (Tailwind v4 @theme)
//   - deadrotcom/packages/assets/tokens/tokens.css (:root vars)
//   - deadrotcom/packages/assets/tokens/fonts.css (single font delivery decision)
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

const FONT_ROLES = ["display", "body", "mono"] as const;
const GOOGLE_FONT_WEIGHTS: Record<string, number[]> = {
  Inter: [400, 500, 600, 700, 800],
  Oswald: [700],
  "JetBrains Mono": [400, 500, 600, 700],
};

type FontRole = (typeof FONT_ROLES)[number];

interface FontFamilyRecord {
  role: FontRole;
  family: string;
  stack: string;
  source: "google-fonts" | "system";
  weights: number[];
}

function parseFontStack(stack: string): string[] {
  return stack
    .split(",")
    .map((family) => family.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function googleFamilyParam(family: string, weights: number[]): string {
  const name = family.trim().replace(/\s+/g, "+");
  return `family=${name}:wght@${weights.join(";")}`;
}

function buildFontRecords(typography: Record<string, any>): FontFamilyRecord[] {
  return FONT_ROLES.map((role) => {
    const stack = String(typography[role]?.fontFamily ?? "");
    const family = parseFontStack(stack)[0] ?? "";
    const weights = GOOGLE_FONT_WEIGHTS[family] ?? [];
    return {
      role,
      family,
      stack,
      source: weights.length > 0 ? "google-fonts" : "system",
      weights,
    };
  });
}

export function buildFontArtifacts(typography: Record<string, any>, version: string, hash: string) {
  const requiredFamilies = buildFontRecords(typography);
  const googleFamilies = requiredFamilies
    .filter((record) => record.source === "google-fonts")
    .sort((a, b) => a.family.localeCompare(b.family));
  const imports = googleFamilies.length
    ? [
        `https://fonts.googleapis.com/css2?${googleFamilies
          .map((record) => googleFamilyParam(record.family, record.weights))
          .join("&")}&display=swap`,
      ]
    : [];
  const css =
    banner(version, hash) +
    imports.map((href) => `@import url("${href}");`).join("\n") +
    (imports.length ? "\n\n" : "") +
    `:root {\n` +
    `  --font-display: ${typography.display?.fontFamily ?? ""};\n` +
    `  --font-body: ${typography.body?.fontFamily ?? ""};\n` +
    `  --font-mono: ${typography.mono?.fontFamily ?? ""};\n` +
    `}\n`;

  return {
    css,
    metadata: {
      delivery: {
        strategy: imports.length ? "google-fonts-css2" : "system",
        cssFile: "fonts.css",
        imports,
      },
      requiredFamilies,
    },
  };
}

export function buildTokenArtifacts(input: {
  version: string;
  hash: string;
  colors: Record<string, string>;
  typography: Record<string, any>;
  assetgen: any;
}) {
  const { version, hash, colors, typography: typ, assetgen: ag } = input;
  const fontArtifacts = buildFontArtifacts(typ, version, hash);

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

  const tokensJson =
    JSON.stringify(
      {
        generated: {
          source: "lore/DESIGN.md",
          version,
          hash,
          command: "bun assetgen tokens",
        },
        colors,
        typography: typ,
        fonts: fontArtifacts.metadata,
      },
      null,
      2,
    ) + "\n";

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

  return {
    styleGen,
    tokensTs,
    tokensJson,
    themeCss,
    tokensCss,
    fontsCss: fontArtifacts.css,
  };
}

export interface TokensResult {
  drift: boolean;
  files: string[];
}

export function resolveAssetsDir(override?: string): string {
  const candidates = [
    override,
    join(ROOT, "..", "deadrotcom", "packages", "assets"),
    join(ROOT, "packages", "assets"),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(join(c, "assets-catalog.json"))) return c;
  throw new Error(`assets package not found (tried: ${candidates.join(", ")}). Pass --assets-dir <path>.`);
}

export async function runTokens(
  opts: { check?: boolean; design?: string; assetsDir?: string; log?: (m: string) => void } = {},
): Promise<TokensResult> {
  const log = opts.log ?? (() => {});
  const designPath = resolveDesignPath(opts.design);
  const assetsDir = resolveAssetsDir(opts.assetsDir);
  const design = frontmatter(await readFile(designPath, "utf8"));
  const colors: Record<string, string> = design.colors ?? {};
  const version: string = String(design.version ?? "0.0.0");
  const ag = deepResolve(design.assetgen ?? {}, colors);
  const hash = (Bun as any)
    .hash(JSON.stringify({ version, colors, typography: design.typography, assetgen: ag }))
    .toString(16)
    .slice(0, 8);

  log(`[tokens] source: ${relative(ROOT, designPath)} (v${version} hash:${hash})`);
  const artifacts = buildTokenArtifacts({
    version,
    hash,
    colors,
    typography: design.typography ?? {},
    assetgen: ag,
  });

  const outputs: Record<string, string> = {
    [join(here, "style.generated.ts")]: artifacts.styleGen,
    [join(assetsDir, "tokens/tokens.ts")]: artifacts.tokensTs,
    [join(assetsDir, "tokens/tokens.json")]: artifacts.tokensJson,
    [join(assetsDir, "tokens/theme.css")]: artifacts.themeCss,
    [join(assetsDir, "tokens/tokens.css")]: artifacts.tokensCss,
    [join(assetsDir, "tokens/fonts.css")]: artifacts.fontsCss,
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
