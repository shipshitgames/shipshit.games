import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { runTokens } from "./tokens";

const DESIGN = `---
version: "9.9.9"
colors:
  primary: "#c1121f"
  onPrimary: "#f4efe6"
  void: "#0a0a0a"
  coal: "#121214"
  gunmetal: "#34343c"
  blood: "#c1121f"
  rust: "#a35a33"
  bone: "#e9e3d6"
  hellfire: "#ff6a00"
  toxic: "#8bdc1f"
typography:
  display:
    fontFamily: "Oswald, sans-serif"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
  label:
    fontFamily: "Oswald, sans-serif"
elevation:
  flat: "none"
  ember: "0 0 0 1px rgba(255,106,0,0.35), 0 0 26px -6px rgba(193,18,31,0.65)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.onPrimary}"
pixelArt:
  medium: "medium-chunky pixel art"
  gridHeight: "110px"
  rendering: "visible square pixels"
  shading: "ordered dithering"
  palette: "void, blood, bone, hellfire; toxic only for Scourge assets"
  references: "DOOM sprites"
gameArtDirection:
  shared:
    medium: "medium-chunky high-detail pixel art"
    renderRules: "nearest-neighbor scaling"
    paletteRules: "void and blood"
  scourge-survivors:
    camera: "first-person billboard sprites"
    read: "readable at FPS combat distance"
assetgen:
  styleSuffix: "test authored style using {colors.primary}"
  negativePrompts:
    - "test negative"
  perGameFraming:
    shared: "test shared framing"
  kindMap:
    sprite: "test sprite"
  scourgeRule:
    trigger: "\\bscourge\\b"
    flags: "i"
    clause: "test parasite takeover using {colors.toxic}"
  gradeParams:
    pixelGrid: 110
    blackPoint: "{colors.void}"
  referenceImages:
    shared: "test-style.webp"
  providers:
    default: "openai"
    openai:
      model: "test-image-model"
---

# Test design
`;

test("runTokens writes all generated token artifacts without an assets catalog", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-tokens-test-"));
  const designPath = join(dir, "DESIGN.md");
  const assetsDir = join(dir, "packages", "assets");
  const styleGeneratedPath = join(dir, "style.generated.ts");
  const webThemePath = join(dir, "apps", "web", "app", "theme.css");
  await writeFile(designPath, DESIGN);

  const result = await runTokens({
    design: designPath,
    assetsDir,
    styleGeneratedPath,
    webThemePath,
  });

  assert.equal(result.drift, false);
  assert.equal(existsSync(styleGeneratedPath), true);
  assert.equal(existsSync(webThemePath), true);
  assert.equal(existsSync(join(assetsDir, "tokens", "tokens.ts")), true);
  assert.equal(existsSync(join(assetsDir, "tokens", "theme.css")), true);
  assert.equal(existsSync(join(assetsDir, "tokens", "tokens.css")), true);
  assert.equal(existsSync(join(assetsDir, "tokens", "tokens.json")), true);

  const style = await readFile(styleGeneratedPath, "utf8");
  assert.match(style, /PALETTE_LINE/);
  assert.match(style, /test-image-model/);
  assert.match(style, /test parasite takeover using #8bdc1f/);

  const tokensTs = await readFile(join(assetsDir, "tokens", "tokens.ts"), "utf8");
  assert.match(tokensTs, /primary: 0xc1121f/);
  assert.match(tokensTs, /"label": "Oswald, sans-serif"/);

  const themeCss = await readFile(join(assetsDir, "tokens", "theme.css"), "utf8");
  assert.match(themeCss, /--color-primary: #c1121f/);
  assert.match(themeCss, /--font-display: Oswald, sans-serif/);
  assert.match(themeCss, /--shadow-ember: 0 0 0 1px rgba\(255,106,0,0\.35\)/);
  assert.equal(await readFile(webThemePath, "utf8"), themeCss);

  const tokensJson = JSON.parse(await readFile(join(assetsDir, "tokens", "tokens.json"), "utf8"));
  assert.equal(tokensJson.version, "9.9.9");
  assert.equal(tokensJson.notice.includes("DO NOT EDIT"), true);
  assert.equal(tokensJson.components["button-primary"].backgroundColor, "#c1121f");
  assert.equal(tokensJson.assetgen.gradeParams.pixelGrid, 110);
  assert.deepEqual(tokensJson.assetgen.gradeParams.softGrade, {
    strength: 0.18,
    valueRange: [0.04, 0.9],
    temperatureRange: [0, 0.45],
    alphaThreshold: 8,
    materialPixelRatio: 0.05,
    exampleLimit: 8,
  });
});

test("runTokens rejects DESIGN.md without the authored assetgen canon", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-tokens-missing-canon-test-"));
  const designPath = join(dir, "DESIGN.md");
  await writeFile(
    designPath,
    `---
version: "9.9.9"
colors:
  primary: "#c1121f"
pixelArt:
  palette: "void, blood, bone"
---
`,
  );

  await assert.rejects(
    runTokens({ design: designPath, assetsDir: join(dir, "assets") }),
    /DESIGN\.md frontmatter assetgen is required and must be an object/,
  );
});

test("runTokens emits centralized fonts.css with Google Fonts import + delivery metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-tokens-fonts-test-"));
  const designPath = join(dir, "DESIGN.md");
  const assetsDir = join(dir, "packages", "assets");
  const styleGeneratedPath = join(dir, "style.generated.ts");
  const webThemePath = join(dir, "apps", "web", "app", "theme.css");
  await writeFile(designPath, DESIGN);

  await runTokens({
    design: designPath,
    assetsDir,
    styleGeneratedPath,
    webThemePath,
  });

  const fontsCss = await readFile(join(assetsDir, "tokens", "fonts.css"), "utf8");
  assert.match(fontsCss, /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?/);
  assert.match(fontsCss, /family=Inter:wght@400;500;600;700;800/);
  assert.match(fontsCss, /family=Oswald:wght@700/);
  assert.match(fontsCss, /--font-display: Oswald, sans-serif/);

  const tokensJson = JSON.parse(await readFile(join(assetsDir, "tokens", "tokens.json"), "utf8"));
  assert.equal(tokensJson.fontDelivery.strategy, "google-fonts-css2");
  assert.equal(tokensJson.fontDelivery.cssFile, "fonts.css");
  assert.deepEqual(tokensJson.fontDelivery.imports, [
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Oswald:wght@700&display=swap",
  ]);
});

test("runTokens --repo-only writes all in-repo artifacts, skipping the assets package", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-tokens-repoonly-test-"));
  const designPath = join(dir, "DESIGN.md");
  const assetsDir = join(dir, "packages", "assets");
  const styleGeneratedPath = join(dir, "style.generated.ts");
  const webThemePath = join(dir, "apps", "web", "app", "theme.css");
  await writeFile(designPath, DESIGN);

  const result = await runTokens({
    design: designPath,
    assetsDir,
    styleGeneratedPath,
    webThemePath,
    repoOnly: true,
  });

  assert.equal(result.drift, false);
  assert.deepEqual(result.files, [styleGeneratedPath, webThemePath]);
  assert.equal(existsSync(styleGeneratedPath), true);
  assert.equal(existsSync(webThemePath), true);
  assert.equal(existsSync(join(assetsDir, "tokens", "tokens.ts")), false);

  // A clean --check --repo-only against the just-written artifact reports no drift.
  const logs: string[] = [];
  const check = await runTokens({
    check: true,
    design: designPath,
    assetsDir,
    styleGeneratedPath,
    webThemePath,
    repoOnly: true,
    log: (m) => logs.push(m),
  });
  assert.equal(check.drift, false);
  assert.match(logs.join("\n"), /all artifacts current/);

  await writeFile(webThemePath, "/* stale */\n");
  const drift = await runTokens({
    check: true,
    design: designPath,
    assetsDir,
    styleGeneratedPath,
    webThemePath,
    repoOnly: true,
  });
  assert.equal(drift.drift, true);
});

test("runTokens check reports drift without rewriting artifacts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-tokens-check-test-"));
  const designPath = join(dir, "DESIGN.md");
  const assetsDir = join(dir, "packages", "assets");
  const styleGeneratedPath = join(dir, "style.generated.ts");
  const webThemePath = join(dir, "apps", "web", "app", "theme.css");
  const tokensJsonPath = join(assetsDir, "tokens", "tokens.json");
  await writeFile(designPath, DESIGN);

  await runTokens({
    design: designPath,
    assetsDir,
    styleGeneratedPath,
    webThemePath,
  });
  await writeFile(tokensJsonPath, "{\"stale\":true}\n");

  const result = await runTokens({
    check: true,
    design: designPath,
    assetsDir,
    styleGeneratedPath,
    webThemePath,
  });

  assert.equal(result.drift, true);
  assert.equal(await readFile(tokensJsonPath, "utf8"), "{\"stale\":true}\n");
});
