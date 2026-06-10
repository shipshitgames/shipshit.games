import { expect, test } from "bun:test";

const contract = await Bun.file(new URL("./CANONICAL-ENGINE.md", import.meta.url)).text();
const pkg = await Bun.file(new URL("./package.json", import.meta.url)).json();

test("canonical engine contract records issue 143 ownership decisions", () => {
  const requiredPhrases = [
    "`packages/engine` in this repository is the canonical source",
    "`@shipshitgames/engine`",
    "Do not rename `@shipshitgames/engine` to `@deadrot/engine`",
    "Do not create a standalone engine repository or engine project board",
    "`@deadrot/*` aliases are private monorepo/internal aliases",
  ];

  for (const phrase of requiredPhrases) {
    expect(contract).toContain(phrase);
  }
});

test("canonical engine contract documents Deadrot consumption and duplicate handling", () => {
  const requiredPhrases = [
    "Deadrot games should resolve engine code from this canonical package",
    "\"@shipshitgames/engine\": \"^0.2.0\"",
    "bun link @shipshitgames/engine",
    "temporary compatibility copy",
    "remove `packages/engine` from the",
    "explicit compatibility shim",
  ];

  for (const phrase of requiredPhrases) {
    expect(contract).toContain(phrase);
  }
});

test("engine package intentionally exports the shared assets manifest schema", () => {
  expect(pkg.name).toBe("@shipshitgames/engine");
  expect(pkg.repository.url).toBe("git+https://github.com/shipshitgames/shipshit.games.git");
  expect(pkg.exports["./assets-manifest.schema.json"]).toBe("./src/assets/assets-manifest.schema.json");
  expect(contract).toContain("@shipshitgames/engine/assets-manifest.schema.json");
});
