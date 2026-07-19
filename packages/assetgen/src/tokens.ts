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
  const derived = derivedAssetgenConfig(design, colors);
  const authored = deepResolve(design.assetgen ?? {}, colors);
  const authoredObject = isRecord(authored) ? authored : {};
  const authoredRule = objectMap(authoredObject.scourgeRule);

  return {
    styleSuffix: stringValue(authoredObject.styleSuffix, derived.styleSuffix),
    paletteLine: stringValue(authoredObject.paletteLine, derived.paletteLine),
    negativePrompts: stringArray(authoredObject.negativePrompts, derived.negativePrompts),
    perGameFraming: stringMap(authoredObject.perGameFraming, derived.perGameFraming),
    kindMap: stringMap(authoredObject.kindMap, derived.kindMap),
    scourgeRule: {
      trigger: stringValue(authoredRule.trigger, derived.scourgeRule.trigger),
      flags: stringValue(authoredRule.flags, derived.scourgeRule.flags),
      clause: stringValue(authoredRule.clause, derived.scourgeRule.clause),
    },
    gradeParams: objectMap(authoredObject.gradeParams, derived.gradeParams),
    referenceImages: stringMap(authoredObject.referenceImages, derived.referenceImages),
    providers: objectMap(authoredObject.providers, derived.providers),
  };
}

function derivedAssetgenConfig(design: JsonObject, colors: Record<string, string>): AssetgenConfig {
  const pixelArt = objectMap(design.pixelArt);
  const gameArtDirection = objectMap(design.gameArtDirection);
  const gridHeight = stringValue(pixelArt.gridHeight, "110px");
  const pixelGrid = Number.parseInt(gridHeight, 10) || 110;
  const paletteLine = stringValue(
    pixelArt.palette,
    "void, coal, gunmetal, blood, rust, bone, hellfire; toxic only for Scourge assets",
  );

  return {
    styleSuffix: [
      stringValue(pixelArt.medium, "high-detail medium-chunky pixel art"),
      `game sprite on a visible chunky pixel grid, roughly ${gridHeight} tall`,
      stringValue(pixelArt.rendering, "visible square pixels, hard edges, no anti-aliasing"),
      stringValue(pixelArt.shading, "ordered dithering, subtle dark outline, hellfire rim light"),
      `fixed limited DOOM palette of ${paletteLine}`,
      stringValue(pixelArt.references, "Blasphemous, Dead Cells, remastered 1990s DOOM sprites"),
      "detailed but not noisy",
      "NO neon, no text, no watermark, no UI, single subject only, near-black background",
      "must read as chunky pixel art made of visible square pixels",
      "NOT a smooth 3D render, NOT photorealistic, NOT anti-aliased, NOT painted concept art",
    ]
      .filter(Boolean)
      .join(", "),
    paletteLine,
    negativePrompts: [
      "smooth 3D render",
      "rendered 3D model",
      "photorealistic",
      "photographic",
      "anti-aliased smooth edges",
      "airbrushed",
      "painted concept art",
      "blurry",
      "hi-fi render",
      "cel-shaded cartoon",
      "anime",
      "cute",
      "chibi",
      "slender elegant graceful proportions",
      "symmetrical pretty anatomy",
      "clean plate-armor fantasy knight",
      "medieval robes capes or swords",
      "clean minimal sci-fi",
      "superhero proportions",
      "soft diffuse even lighting",
      "bright daylight",
      "pastel colors",
      "rainbow saturation",
      "cool blue or teal grade",
      "magenta cyan or any neon glow",
      "clean white background",
      "background scenery or landscape",
      "multiple characters",
      "text watermark or logo",
      "UI frames or HUD",
      "cropped or close-up framing that hides the silhouette",
    ],
    perGameFraming: buildGameFraming(gameArtDirection),
    kindMap: {
      texture: "seamless tileable texture",
    },
    scourgeRule: {
      trigger: "\\bscourge\\b",
      flags: "i",
      clause:
        `Scourge subjects must read as host-dependent parasite takeover: overwritten host material, ruptures, tendrils, embedded toxic-green (${colors.toxic ?? "#8bdc1f"}) breach cores, black chitin over stolen bone or metal, and invasive growth; vary host family among flesh, chitin, mycelial, machine-graft, bone-titan, or voidship; never a standalone generic demon or alien`,
    },
    gradeParams: {
      pixelGrid,
      downscale: "box",
      nearestFilter: true,
      dither: "ordered",
      antialias: false,
      hardRemap: true,
      targetPalette: "doom",
      palettePath: "lore/Art/grade/doom.gpl",
      outline: "subtle-dark",
      preserveEmissive: true,
      blackPoint: colors.void ?? "#0a0a0a",
      encode: "webp-lossless",
      cutout: {
        tool: "rembg",
        order: "after-generate-before-downscale",
      },
    },
    referenceImages: {
      "scourge-survivors": "lore/Art/style-refs/scourge-survivors.webp",
      deadlane: "lore/Art/style-refs/deadlane.webp",
      pactfall: "lore/Art/style-refs/pactfall.webp",
      starblight: "lore/Art/style-refs/starblight.webp",
      redline: "lore/Art/style-refs/redline.webp",
      rothulk: "lore/Art/style-refs/rothulk.webp",
      shared: "lore/Art/style-refs/scourge-survivors.webp",
    },
    providers: {
      default: "openai",
      size: "1024x1536",
      candidates: 4,
      openai: {
        model: "gpt-image-2",
        quality: "high",
        output_format: "png",
        background: "opaque",
        seed: null,
        negativeMode: "fold",
        styleRef: "image_refs",
        styleRefNote:
          "match the rendering style, lighting and palette of the reference image; new creature described in the prompt",
      },
      fal: {
        model: "fal-ai/flux/dev",
        image_size: "square_hd",
        guidance_scale: 3.5,
        num_inference_steps: 28,
        seed: 42,
        negativeMode: "param",
        styleRef: "redux",
        image_prompt_strength: 0.18,
        styleRefNote:
          "ref controls STYLE not SHAPE; seed reproducibility breaks once an image ref is attached (non-deterministic vision embedding)",
      },
      codex: {
        model: "gpt-image-2",
        negativeMode: "fold",
        seed: null,
        background: "opaque",
        note: "conversational/no-seed path; good for the noob loop, not batch determinism",
      },
    },
  };
}

function buildGameFraming(gameArtDirection: JsonObject): Record<string, string> {
  const defaults: Record<string, string> = {
    "scourge-survivors": "first-person game billboard sprite, front-facing, full body",
    deadlane: "top-down / high-angle game sprite, silhouette readable from above",
    pactfall: "isometric 3/4-view game sprite, champion scale",
    starblight: "side-on / top-down arcade space-shooter sprite, crisp readable silhouette",
    redline: "side-on runner sprite, profile silhouette readable at courier-lane speed",
    rothulk: "side-on platformer sprite, profile silhouette, clear readable pose",
    shared: "game asset",
  };

  const frames = { ...defaults };
  for (const [game, value] of Object.entries(gameArtDirection)) {
    const direction = objectMap(value);
    const parts =
      game === "shared"
        ? [direction.medium, direction.renderRules, direction.paletteRules]
        : [direction.camera, direction.read];
    const framing = parts.filter((part): part is string => typeof part === "string" && part.length > 0).join("; ");
    if (framing) frames[game] = framing;
  }
  return frames;
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
