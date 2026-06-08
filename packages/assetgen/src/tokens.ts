// `assetgen tokens` — compile lore/DESIGN.md into generated, banner-stamped
// artifacts. The DESIGN.md `assetgen:` block + palette are the SINGLE source of
// truth; this emits:
//   - packages/assetgen/src/style.generated.ts  (asset-gen: suffix, framing,
//     negatives, grade, provider settings, buildPrompt — consumed by style.ts)
//   - deadrotcom/packages/assets/tokens/tokens.ts (COLORS 0xRRGGBB + FONTS, Three.js)
//   - deadrotcom/packages/assets/tokens/theme.css (Tailwind v4 @theme)
//   - deadrotcom/packages/assets/tokens/tokens.css (:root vars)
// `--check` regenerates to a temp tree and diffs the committed files (drift gate).
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // packages/assetgen/src
const ROOT = join(here, "..", "..", ".."); // monorepo root (shipshitgames/)

/** Resolve the canonical DESIGN.md, falling back to the reviewed root copy until lore is wired. */
export function resolveDesignPath(override?: string): string {
  const candidates = [
    override,
    join(ROOT, ".agents/lore/DESIGN.md"), // submodule (preferred once wired)
    join(ROOT, "..", "lore", "DESIGN.md"), // sibling repo (current workspace layout)
    join(ROOT, "DESIGN.md"), // reviewed fallback while lore/DESIGN.md is not checked out
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
  drifts: TokenDrift[];
}

export interface TokenDrift {
  path: string;
  reason: "missing" | "content" | "metadata-unchanged";
  diff?: string;
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
  opts: {
    check?: boolean;
    design?: string;
    assetsDir?: string;
    repoOnly?: boolean;
    stylePath?: string;
    log?: (m: string) => void;
  } = {},
): Promise<TokensResult> {
  const log = opts.log ?? (() => {});
  const designPath = resolveDesignPath(opts.design);
  const assetsDir = opts.repoOnly ? undefined : resolveAssetsDir(opts.assetsDir);
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
    [opts.stylePath ?? join(here, "style.generated.ts")]: styleGen,
  };

  if (assetsDir) {
    outputs[join(assetsDir, "tokens/tokens.ts")] = tokensTs;
    outputs[join(assetsDir, "tokens/theme.css")] = themeCss;
    outputs[join(assetsDir, "tokens/tokens.css")] = tokensCss;
  }

  const drifts: TokenDrift[] = [];
  const tempRoot = opts.check ? await mkdtemp(join(tmpdir(), "assetgen-tokens-")) : undefined;
  for (const [index, [path, content]] of Object.entries(outputs).entries()) {
    const rel = relative(ROOT, path);
    const current = existsSync(path) ? await readFile(path, "utf8") : "";
    if (current === content) {
      log(`[tokens] ok   ${rel}`);
      continue;
    }
    if (opts.check) {
      const tempPath = join(tempRoot ?? tmpdir(), String(index), basename(path));
      await mkdir(dirname(tempPath), { recursive: true });
      await writeFile(tempPath, content);
      const currentMeta = artifactMetadata(current);
      const generatedMeta = artifactMetadata(content);
      const reason =
        current.length === 0
          ? "missing"
          : currentMeta &&
              generatedMeta &&
              currentMeta.version === generatedMeta.version &&
              currentMeta.hash === generatedMeta.hash
            ? "metadata-unchanged"
            : "content";
      const diff = existsSync(path)
        ? await unifiedDiff(path, tempPath, `${rel} (committed)`, `${rel} (generated)`)
        : undefined;
      drifts.push({ path: rel, reason, diff });
      log(`[tokens] DRIFT ${rel} — run 'bun assetgen tokens'`);
      if (reason === "metadata-unchanged") {
        log(`[tokens] version/hash unchanged for ${rel}; token output changed without a metadata bump`);
      }
      if (diff) log(diff.trimEnd());
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      log(`[tokens] wrote ${rel}`);
    }
  }
  if (opts.check && drifts.length === 0) log(`[tokens] all artifacts current ✓`);
  return { drift: drifts.length > 0, files: Object.keys(outputs), drifts };
}

function artifactMetadata(content: string): { version: string; hash: string } | undefined {
  const match = content.match(/^\/\* GENERATED FROM lore\/DESIGN\.md v([^ ]+) hash:([0-9a-f]+) /);
  if (!match?.[1] || !match[2]) return undefined;
  return { version: match[1], hash: match[2] };
}

async function unifiedDiff(
  currentPath: string,
  generatedPath: string,
  currentLabel: string,
  generatedLabel: string,
): Promise<string> {
  const proc = Bun.spawn(["diff", "-u", "--label", currentLabel, "--label", generatedLabel, currentPath, generatedPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode > 1) return stderr.trim();
  return stdout.trim();
}
