import { expect, test } from "bun:test";

const contract = await Bun.file(new URL("./CANONICAL-ENGINE.md", import.meta.url)).text();
const pkg = await Bun.file(new URL("./package.json", import.meta.url)).json();
const workflow = await Bun.file(new URL("../../.github/workflows/ci.yml", import.meta.url)).text();

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
    "\"@shipshitgames/engine\": \"^0.3.0\"",
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

test("engine package pins the documented Three.js compatibility matrix", () => {
  expect(pkg.peerDependencies.three).toBe(">=0.169.0 <0.185.0");
  expect(pkg.peerDependencies.partykit).toBe("0.0.115");
  expect(pkg.peerDependenciesMeta.partykit.optional).toBe(true);
  expect(pkg.optionalDependencies.partykit).toBeUndefined();
  expect(pkg.scripts["smoke:package"]).toBe("bun tests/package-smoke.mjs");
  expect(contract).toContain("Engine `0.3.x` supports `three >=0.169.0 <0.185.0`");
  expect(contract).toContain("installs the tarball into a clean consumer");
  expect(contract).toContain("with matching");
  expect(contract).toContain("semver-breaking engine change");

  for (const [three, types] of [
    ["0.169.0", "0.169.0"],
    ["0.184.0", "0.184.1"],
  ]) {
    const escapedThree = three.replaceAll(".", "\\.");
    const escapedTypes = types.replaceAll(".", "\\.");
    expect(workflow).toMatch(new RegExp(`-\\s+three: "${escapedThree}"\\s+types: "${escapedTypes}"`));
  }

  expect(workflow).toContain("engine-package-gate:");
  expect(workflow).toContain("name: Engine Package\n");
  expect(workflow).toContain("needs: engine-package");
  expect(workflow).toContain('run: test "${{ needs.engine-package.result }}" = "success"');
});
