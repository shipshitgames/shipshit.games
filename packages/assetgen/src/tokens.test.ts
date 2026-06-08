import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTokenArtifacts } from "./tokens";

test("token artifacts include centralized font delivery metadata", () => {
  const artifacts = buildTokenArtifacts({
    version: "9.9.9",
    hash: "abc12345",
    colors: {
      void: "#0a0a0a",
      bone: "#e9e3d6",
    },
    typography: {
      display: {
        fontFamily: "Oswald, 'Arial Narrow', 'Helvetica Neue', sans-serif",
      },
      body: {
        fontFamily: "Inter, system-ui, sans-serif",
      },
      mono: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      },
    },
    assetgen: {},
  });

  assert.match(artifacts.fontsCss, /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?/);
  assert.match(artifacts.fontsCss, /family=Inter:wght@400;500;600;700;800/);
  assert.match(artifacts.fontsCss, /family=Oswald:wght@700/);
  assert.match(artifacts.fontsCss, /--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;/);

  const tokens = JSON.parse(artifacts.tokensJson);
  assert.equal(tokens.generated.version, "9.9.9");
  assert.equal(tokens.generated.hash, "abc12345");
  assert.equal(tokens.fonts.delivery.strategy, "google-fonts-css2");
  assert.equal(tokens.fonts.delivery.cssFile, "fonts.css");
  assert.deepEqual(tokens.fonts.delivery.imports, [
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Oswald:wght@700&display=swap",
  ]);
  assert.deepEqual(
    tokens.fonts.requiredFamilies.map(
      (record: { role: string; family: string; source: string; weights: number[] }) => ({
        role: record.role,
        family: record.family,
        source: record.source,
        weights: record.weights,
      }),
    ),
    [
      { role: "display", family: "Oswald", source: "google-fonts", weights: [700] },
      { role: "body", family: "Inter", source: "google-fonts", weights: [400, 500, 600, 700, 800] },
      { role: "mono", family: "ui-monospace", source: "system", weights: [] },
    ],
  );
});
