// `assetgen tokens` compiles DESIGN.md frontmatter into generated,
// banner-stamped artifacts. The design frontmatter is the single source of
// truth for studio colors, fonts, Tailwind theme values, imperative TS tokens,
// and the asset-generation style bridge consumed by style.ts.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // packages/assetgen/src
const ROOT = join(here, "..", "..", ".."); // monorepo root
const GENERATED_SOURCE_LABEL = "lore/DESIGN.md";

type JsonObject = Record<string, unknown>;

interface AssetgenConfig {
  styleSuffix: string;
  paletteLine: string;
  negativePrompts: string[];
  perGameFraming: Record<string, string>;
  kindMap: Record<string, string>;
  scourgeRule: {
    trigger: string;
    flags: string;
    clause: string;
  };
  gradeParams: JsonObject;
  referenceImages: Record<string, string>;
  providers: JsonObject;
}

export interface TokensResult {
  drift: boolean;
  files: string[];
}

interface RunTokensOptions {
  check?: boolean;
  design?: string;
  assetsDir?: string;
  styleGeneratedPath?: string;
  webThemePath?: string;
  /** Restrict to in-repo artifacts, skipping the external assets package — used by CI. */
  repoOnly?: boolean;
  log?: (message: string) => void;
}

interface TokenArtifacts {
  files: Record<string, string>;
  hash: string;
  source: string;
  version: string;
}

/** Resolve the canonical DESIGN.md. Root DESIGN.md remains valid until lore is wired. */
export function resolveDesignPath(override?: string): string {
  const candidates = [
    override,
    join(ROOT, ".agents/lore/DESIGN.md"),
    join(ROOT, "..", "lore", "DESIGN.md"),
    join(ROOT, "DESIGN.md"),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error(`DESIGN.md not found (tried: ${candidates.join(", ")}). Pass --design <path>.`);
}

export function resolveTokenAssetsDir(override?: string): string {
  return override ?? join(ROOT, "packages", "assets");
}

function frontmatter(text: string): JsonObject {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) throw new Error("DESIGN.md has no YAML frontmatter");
  return (Bun as unknown as { YAML: { parse(input: string): unknown } }).YAML.parse(match[1]) as JsonObject;
}

function buildTokenArtifacts(opts: {
  assetsDir: string;
  design: JsonObject;
  designPath: string;
  styleGeneratedPath?: string;
  webThemePath?: string;
}): TokenArtifacts {
  const colors = stringMap(opts.design.colors, {});
  const typography = objectMap(opts.design.typography);
  const elevation = stringMap(deepResolve(opts.design.elevation ?? {}, colors), {});
  const version = String(opts.design.version ?? "0.0.0");
  const assetgen = buildAssetgenConfig(opts.design, colors);
  const components = deepResolve(opts.design.components ?? {}, colors);

  // Art bible (#43): material/lighting/silhouette grammar + per-asset-type
  // direction + reference slots, folded into generation prompts.
  const artBibleSource = objectMap(opts.design.artBible);
  const artBible = {
    materialGrammar: stringArray(artBibleSource.materialGrammar, []),
    lightingGrammar: stringArray(artBibleSource.lightingGrammar, []),
    silhouetteGrammar: stringArray(artBibleSource.silhouetteGrammar, []),
  };
  const assetTypeDirection = stringMap(deepResolve(artBibleSource.assetTypeDirection ?? {}, colors), {});
  const referenceSlots = stringMap(deepResolve(artBibleSource.referenceSlots ?? {}, colors), {});

  const hashInput = {
    version,
    colors,
    typography,
    rounded: objectMap(opts.design.rounded),
    spacing: objectMap(opts.design.spacing),
    elevation,
    components,
    pixelArt: objectMap(opts.design.pixelArt),
    gameArtDirection: objectMap(opts.design.gameArtDirection),
    artBible: { ...artBible, assetTypeDirection, referenceSlots },
    assetgen,
  };
  const hash = (Bun as unknown as { hash(input: string): number | bigint })
    .hash(JSON.stringify(hashInput))
    .toString(16)
    .slice(0, 8);

  const styleGeneratedPath = opts.styleGeneratedPath ?? join(here, "style.generated.ts");
  const webThemePath = opts.webThemePath ?? join(ROOT, "apps", "web", "app", "theme.css");
  const tokensDir = join(opts.assetsDir, "tokens");
  const source = repoRelative(opts.designPath);
  const generatedNotice = `GENERATED FROM ${GENERATED_SOURCE_LABEL} v${version} hash:${hash} - DO NOT EDIT. Run: bun assetgen tokens`;
  const cssBanner = banner(version, hash);
  const fonts = buildFonts(typography);
  const fontDelivery = buildFontDelivery(typography, version, hash);

  const styleGen =
    cssBanner +
    `// Asset-generation style, compiled from DESIGN.md frontmatter.\n` +
    `// style.ts re-exports these; edit the design source, not this file.\n\n` +
    `export const STYLE_SUFFIX = ${JSON.stringify(fold(assetgen.styleSuffix))};\n\n` +
    `export const PALETTE_LINE = ${JSON.stringify(fold(assetgen.paletteLine))};\n\n` +
    `export const ART_BIBLE = ${JSON.stringify(artBible, null, 2)} as const;\n\n` +
    `export const ASSET_TYPE_DIRECTION: Record<string, string> = ${JSON.stringify(assetTypeDirection, null, 2)};\n\n` +
    `export const REFERENCE_SLOTS: Record<string, string> = ${JSON.stringify(referenceSlots, null, 2)};\n\n` +
    `export const NEGATIVE_PROMPTS: string[] = ${JSON.stringify(assetgen.negativePrompts, null, 2)};\n\n` +
    `export const GAME_FRAMING: Record<string, string> = ${JSON.stringify(assetgen.perGameFraming, null, 2)};\n\n` +
    `export const KIND_MAP: Record<string, string> = ${JSON.stringify(assetgen.kindMap, null, 2)};\n\n` +
    `export const SCOURGE_RULE = { pattern: /${assetgen.scourgeRule.trigger}/${assetgen.scourgeRule.flags}, clause: ${JSON.stringify(fold(assetgen.scourgeRule.clause))} };\n\n` +
    `export const GRADE_PARAMS = ${JSON.stringify(assetgen.gradeParams, null, 2)} as const;\n\n` +
    `export const STYLE_REF: Record<string, string> = ${JSON.stringify(assetgen.referenceImages, null, 2)};\n\n` +
    `export const PROVIDER_SETTINGS = ${JSON.stringify(assetgen.providers, null, 2)} as const;\n\n` +
    `/** Compose a generation prompt from the subject, asset kind, game framing, and design suffix. */\n` +
    `export function buildPrompt(opts: { prompt: string; game: string; kind: string }): string {\n` +
    `  const framing = GAME_FRAMING[opts.game] ?? GAME_FRAMING.shared;\n` +
    `  const kind = KIND_MAP[opts.kind] ?? opts.kind;\n` +
    `  const assetDirection = ASSET_TYPE_DIRECTION[opts.kind] ?? "";\n` +
    `  const scourge = SCOURGE_RULE.pattern.test(opts.prompt) ? SCOURGE_RULE.clause : "";\n` +
    `  const parts = [opts.prompt, kind, framing, assetDirection, STYLE_SUFFIX].filter(Boolean);\n` +
    `  if (scourge) parts.push(scourge);\n` +
    `  return parts.join(". ") + ".";\n` +
    `}\n`;

  const tokensTs =
    cssBanner +
    `// Design tokens for imperative Three.js + TypeScript. Hex ints for THREE.Color.\n\n` +
    `export const COLORS = {\n` +
    Object.entries(colors)
      .map(([key, hex]) => `  ${key}: 0x${hex.replace(/^#/, "")},`)
      .join("\n") +
    `\n} as const;\n\n` +
    `export const FONTS = ${JSON.stringify(fonts, null, 2)} as const;\n`;

  const themeCss =
    cssBanner +
    `@theme {\n` +
    [
      ...Object.entries(colors).map(([key, hex]) => `  --color-${kebab(key)}: ${hex};`),
      ...Object.entries(fonts).map(([key, family]) => `  --font-${kebab(key)}: ${family};`),
      ...Object.entries(elevation).map(([key, shadow]) => `  --shadow-${kebab(key)}: ${shadow};`),
    ].join("\n") +
    `\n}\n`;

  const tokensCss =
    cssBanner +
    `:root {\n` +
    Object.entries(colors)
      .map(([key, hex]) => `  --${kebab(key)}: ${hex};`)
      .join("\n") +
    `\n` +
    Object.entries(fonts)
      .map(([key, family]) => `  --font-${kebab(key)}: ${family};`)
      .join("\n") +
    `\n}\n`;

  const tokensJson =
    JSON.stringify(
      {
        notice: generatedNotice,
        version,
        hash,
        source,
        colors,
        typography,
        fonts,
        fontDelivery: fontDelivery.delivery,
        requiredFamilies: fontDelivery.requiredFamilies,
        rounded: objectMap(opts.design.rounded),
        spacing: objectMap(opts.design.spacing),
        elevation: objectMap(opts.design.elevation),
        components,
        pixelArt: objectMap(opts.design.pixelArt),
        gameArtDirection: objectMap(opts.design.gameArtDirection),
        assetgen,
      },
      null,
      2,
    ) + "\n";

  return {
    files: {
      [styleGeneratedPath]: styleGen,
      [webThemePath]: themeCss,
      [join(tokensDir, "tokens.ts")]: tokensTs,
      [join(tokensDir, "theme.css")]: themeCss,
      [join(tokensDir, "tokens.css")]: tokensCss,
      [join(tokensDir, "fonts.css")]: fontDelivery.css,
      [join(tokensDir, "tokens.json")]: tokensJson,
    },
    hash,
    source,
    version,
  };
}

export async function runTokens(opts: RunTokensOptions = {}): Promise<TokensResult> {
  const log = opts.log ?? (() => {});
  const designPath = resolveDesignPath(opts.design);
  const assetsDir = resolveTokenAssetsDir(opts.assetsDir);
  const design = frontmatter(await readFile(designPath, "utf8"));
  const artifacts = buildTokenArtifacts({
    assetsDir,
    design,
    designPath,
    styleGeneratedPath: opts.styleGeneratedPath,
    webThemePath: opts.webThemePath,
  });

  log(`[tokens] source: ${artifacts.source} (v${artifacts.version} hash:${artifacts.hash})`);

  // --repo-only checks the in-repo generated consumers, skipping the external
  // assets package (which is absent in CI / a fresh clone of this repo).
  const tokensDir = join(assetsDir, "tokens");
  const files = opts.repoOnly
    ? Object.entries(artifacts.files).filter(([path]) => !path.startsWith(tokensDir))
    : Object.entries(artifacts.files);

  let drift = false;
  for (const [path, content] of files) {
    const rel = repoRelative(path);
    const current = existsSync(path) ? await readFile(path, "utf8") : "";
    if (current === content) {
      log(`[tokens] ok   ${rel}`);
      continue;
    }
    if (opts.check) {
      drift = true;
      log(`[tokens] DRIFT ${rel} - run 'bun assetgen tokens'`);
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      log(`[tokens] wrote ${rel}`);
    }
  }
  if (opts.check && !drift) log("[tokens] all artifacts current");
  return { drift, files: files.map(([path]) => path) };
}

function buildAssetgenConfig(design: JsonObject, colors: Record<string, string>): AssetgenConfig {
  const authored = requiredObject(deepResolve(design.assetgen, colors), "assetgen");
  const authoredRule = requiredObject(authored.scourgeRule, "assetgen.scourgeRule");
  const pixelArt = requiredObject(design.pixelArt, "pixelArt");

  return {
    styleSuffix: requiredString(authored.styleSuffix, "assetgen.styleSuffix"),
    paletteLine: requiredString(pixelArt.palette, "pixelArt.palette"),
    negativePrompts: requiredStringArray(authored.negativePrompts, "assetgen.negativePrompts"),
    perGameFraming: requiredStringMap(authored.perGameFraming, "assetgen.perGameFraming"),
    kindMap: requiredStringMap(authored.kindMap, "assetgen.kindMap"),
    scourgeRule: {
      trigger: requiredString(authoredRule.trigger, "assetgen.scourgeRule.trigger"),
      flags: requiredString(authoredRule.flags, "assetgen.scourgeRule.flags"),
      clause: requiredString(authoredRule.clause, "assetgen.scourgeRule.clause"),
    },
    gradeParams: requiredObject(authored.gradeParams, "assetgen.gradeParams"),
    referenceImages: requiredStringMap(authored.referenceImages, "assetgen.referenceImages"),
    providers: requiredObject(authored.providers, "assetgen.providers"),
  };
}

function buildFonts(typography: JsonObject): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(typography)) {
    const token = objectMap(value);
    const family = stringValue(token.fontFamily, "");
    if (family) result[key] = family;
  }
  return result;
}

// Centralized font delivery (#41): one decision for how display/body/mono load.
const FONT_DELIVERY_ROLES = ["display", "body", "mono"] as const;
const GOOGLE_FONT_WEIGHTS: Record<string, number[]> = {
  Inter: [400, 500, 600, 700, 800],
  Oswald: [700],
  "JetBrains Mono": [400, 500, 600, 700],
};

interface FontFamilyRecord {
  role: (typeof FONT_DELIVERY_ROLES)[number];
  family: string;
  stack: string;
  source: "google-fonts" | "system";
  weights: number[];
}

interface FontDelivery {
  css: string;
  delivery: { strategy: string; cssFile: string; imports: string[] };
  requiredFamilies: FontFamilyRecord[];
}

function buildFontDelivery(typography: JsonObject, version: string, hash: string): FontDelivery {
  const requiredFamilies: FontFamilyRecord[] = FONT_DELIVERY_ROLES.map((role) => {
    const stack = stringValue(objectMap(typography[role]).fontFamily, "");
    const family = stack.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
    const weights = GOOGLE_FONT_WEIGHTS[family] ?? [];
    return { role, family, stack, source: weights.length > 0 ? "google-fonts" : "system", weights };
  });
  const google = requiredFamilies
    .filter((record) => record.source === "google-fonts")
    .sort((a, b) => a.family.localeCompare(b.family));
  const imports = google.length
    ? [
        `https://fonts.googleapis.com/css2?${google
          .map((record) => `family=${record.family.replace(/\s+/g, "+")}:wght@${record.weights.join(";")}`)
          .join("&")}&display=swap`,
      ]
    : [];
  const css =
    banner(version, hash) +
    imports.map((href) => `@import url("${href}");`).join("\n") +
    (imports.length ? "\n\n" : "") +
    `:root {\n` +
    requiredFamilies.map((record) => `  --font-${record.role}: ${record.stack};`).join("\n") +
    `\n}\n`;
  return {
    css,
    delivery: { strategy: imports.length ? "google-fonts-css2" : "system", cssFile: "fonts.css", imports },
    requiredFamilies,
  };
}

function deepResolve(value: unknown, colors: Record<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{(?:tokens|colors)\.([A-Za-z0-9]+)\}/g, (_, key: string) => colors[key] ?? `{${key}?}`);
  }
  if (Array.isArray(value)) return value.map((item) => deepResolve(item, colors));
  if (isRecord(value)) {
    const resolved: JsonObject = {};
    for (const [key, child] of Object.entries(value)) resolved[key] = deepResolve(child, colors);
    return resolved;
  }
  return value;
}

function objectMap(value: unknown, fallback: JsonObject = {}): JsonObject {
  return isRecord(value) ? value : fallback;
}

function stringMap(value: unknown, fallback: Record<string, string>): Record<string, string> {
  if (!isRecord(value)) return fallback;
  const result: Record<string, string> = { ...fallback };
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") result[key] = child;
  }
  return result;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function requiredObject(value: unknown, path: string): JsonObject {
  if (isRecord(value)) return value;
  throw new Error(`DESIGN.md frontmatter ${path} is required and must be an object`);
}

function requiredString(value: unknown, path: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`DESIGN.md frontmatter ${path} is required and must be a non-empty string`);
}

function requiredStringArray(value: unknown, path: string): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new Error(`DESIGN.md frontmatter ${path} is required and must be an array of strings`);
}

function requiredStringMap(value: unknown, path: string): Record<string, string> {
  if (isRecord(value) && Object.values(value).every((item) => typeof item === "string")) {
    return value as Record<string, string>;
  }
  throw new Error(`DESIGN.md frontmatter ${path} is required and must contain only string values`);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function fold(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function banner(version: string, hash: string): string {
  return `/* GENERATED FROM ${GENERATED_SOURCE_LABEL} v${version} hash:${hash} - DO NOT EDIT. Run: bun assetgen tokens */\n`;
}

function repoRelative(path: string): string {
  const rel = relative(ROOT, path);
  return rel.startsWith("..") ? path : rel;
}
