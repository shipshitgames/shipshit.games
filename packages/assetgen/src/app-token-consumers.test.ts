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

test("desktop imports generated root tokens instead of local theme forks", async () => {
  const styles = await repoFile("apps/desktop/src/styles.css");
  const tokens = await repoFile("apps/desktop/src/tokens.css");

  assert.match(styles, /^@import "\.\/tokens\.css";/);
  assert.match(tokens, /GENERATED FROM DESIGN\.md/);
  assert.match(tokens, /:root\s*\{/);
  assert.match(tokens, /--void: #0a0a0a;/);
  assert.match(tokens, /--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;/);
  assert.match(styles, /background: var\(--void\);/);
  assert.match(styles, /font-family: var\(--font-body\);/);

  for (const forbidden of [
    /--bg:/,
    /--line:/,
    /--line-bright:/,
    /--font-ui:/,
    /JetBrains Mono/,
    /#46464f/,
    /var\(--bg/,
    /var\(--line/,
    /var\(--font-ui/,
  ]) {
    assert.doesNotMatch(styles, forbidden);
  }
});

test("assetgen style facade re-exports generated style tokens", async () => {
  const style = await repoFile("packages/assetgen/src/style.ts");

  assert.match(style, /from "\.\/style\.generated\.ts";/);
  assert.match(style, /export \{\s*STYLE_SUFFIX,/);
  assert.doesNotMatch(style, /export const STYLE_SUFFIX =/);
});
