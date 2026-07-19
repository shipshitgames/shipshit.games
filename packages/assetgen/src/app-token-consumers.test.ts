import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

async function repoFile(path: string): Promise<string> {
  return readFile(join(repoRoot, path), "utf8");
}

test("web imports generated Tailwind theme tokens", async () => {
  const globals = await repoFile("apps/web/app/globals.css");
  const theme = await repoFile("apps/web/app/theme.css");

  assert.match(globals, /@import "\.\/theme\.css";/);
  assert.match(theme, /GENERATED FROM DESIGN\.md/);
  assert.match(theme, /@theme\s*\{/);
  assert.match(theme, /--color-void: #0a0a0a;/);
  assert.match(theme, /--shadow-ember:/);

  assert.doesNotMatch(globals, /--color-void:\s*#/);
  assert.doesNotMatch(globals, /--background:\s*#/);
  assert.match(globals, /--background: var\(--color-void\);/);
});

test("desktop ships its own cockpit theme and does not fork the game-brand tokens", async () => {
  // The studio cockpit deliberately uses the neutral ShipCode-style work-surface
  // theme (theme.css), not the game-brand DESIGN.md tokens — those stay on web +
  // games. Guard the new contract: one theme source, imported once, and no
  // stray game-brand variables re-forked into the shell stylesheet.
  const styles = await repoFile("apps/desktop/src/renderer/styles.css");
  const theme = await repoFile("apps/desktop/src/renderer/theme.css");

  assert.match(styles, /^@import "\.\/theme\.css";/);
  assert.match(theme, /:root\s*\{/);
  assert.match(theme, /--bg-primary: #050607;/);
  assert.match(theme, /--accent: #fafafa;/);
  assert.match(theme, /--font-mono: "SF Mono", SFMono-Regular, Menlo, Consolas, ui-monospace, monospace;/);
  assert.match(styles, /background: var\(--bg-primary\);/);
  assert.match(styles, /font-family: var\(--font-sans\);/);

  for (const forbidden of [
    /var\(--void\)/,
    /var\(--coal\)/,
    /var\(--iron\)/,
    /var\(--gunmetal\)/,
    /var\(--blood/,
    /var\(--hellfire\)/,
    /var\(--bone\)/,
    /var\(--ash\)/,
    /var\(--toxic\)/,
    /var\(--font-body\)/,
    /var\(--font-display\)/,
    /var\(--font-label\)/,
  ]) {
    assert.doesNotMatch(styles, forbidden);
    assert.doesNotMatch(theme, forbidden);
  }
});

test("assetgen style facade re-exports generated style tokens", async () => {
  const style = await repoFile("packages/assetgen/src/style.ts");

  assert.match(style, /from "\.\/style\.generated\.ts";/);
  assert.match(style, /export \{[\s\S]*?\bSTYLE_SUFFIX,/);
  assert.doesNotMatch(style, /export const STYLE_SUFFIX =/);
});
