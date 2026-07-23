import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createLoreVaultStore } from "./lore-vault";
import { createPlayLabStore } from "./play-lab";

const temps: string[] = [];

function tempDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-play-lab-"));
  temps.push(root);
  return root;
}

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function makeDeadrotLikeRepo(): string {
  const root = tempDir();
  write(path.join(root, "package.json"), JSON.stringify({ name: "deadrot.com" }, null, 2));
  write(
    path.join(root, "apps", "lore", "content", "factions", "scourge.md"),
    "# The Scourge\n\nParasites and host-takeover organisms, not generic monsters.",
  );
  write(
    path.join(root, "apps", "games", "scourge-survivors", "package.json"),
    JSON.stringify({
      name: "@deadrot/scourge-survivors",
      scripts: { dev: "vite --host 0.0.0.0" },
    }),
  );
  write(
    path.join(root, "apps", "games", "scourge-survivors", "src", "game", "data", "maps.ts"),
    "export const maps = [];",
  );
  write(path.join(root, "packages", "assets", "assets-catalog.json"), '{"entities":[]}');
  return root;
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop()!, { recursive: true, force: true });
});

test("uses the canonical project registry while detecting lore, games, maps, and assets", () => {
  const repoPath = makeDeadrotLikeRepo();
  const project = {
    id: "deadrot",
    name: "Deadrot",
    slug: "deadrot",
    repoPath,
    source: "registered" as const,
  };
  const loreVault = createLoreVaultStore({ repos: [project] });
  const playLab = createPlayLabStore({
    projects: [project],
    activeProjectId: project.id,
    loreVault,
  });

  const context = playLab.context();

  expect(context?.project).toMatchObject({
    id: "deadrot",
    isActive: true,
    valid: true,
    packageName: "deadrot.com",
    loreExists: true,
    loreFileCount: 1,
    assetCatalogExists: true,
  });
  expect(context?.games[0]).toMatchObject({
    slug: "scourge-survivors",
    packageName: "@deadrot/scourge-survivors",
    scripts: { dev: "vite --host 0.0.0.0" },
    maps: [{ id: "maps", path: "src/game/data/maps.ts" }],
  });
});

test("builds bounded reusable prompt context from the shared lore index", () => {
  const repoPath = makeDeadrotLikeRepo();
  const project = { id: "deadrot", name: "Deadrot", slug: "deadrot", repoPath };
  const loreVault = createLoreVaultStore({ repos: [project] });
  const playLab = createPlayLabStore({
    projects: [project],
    activeProjectId: "deadrot",
    loreVault,
  });

  const context = playLab.context();

  expect(context?.lore).toHaveLength(1);
  expect(context?.promptContext).toContain("Repo: Deadrot");
  expect(context?.promptContext).toContain("scourge-survivors");
  expect(context?.promptContext).toContain("Parasites and host-takeover organisms");
  expect(context?.truncated).toBe(false);
});

test("returns null when the project registry is empty", () => {
  const loreVault = createLoreVaultStore({ repos: [] });
  const playLab = createPlayLabStore({
    projects: [],
    activeProjectId: "",
    loreVault,
  });

  expect(playLab.context()).toBeNull();
});
