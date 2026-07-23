import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createLoreVaultStore } from "./lore-vault";

const temps: string[] = [];

function tempDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-lore-vault-"));
  temps.push(root);
  return root;
}

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function makeRepo(): string {
  const root = tempDir();
  const vault = path.join(root, "apps", "lore", "content");
  write(
    path.join(vault, "Factions", "The-Scourge.md"),
    "---\ntitle: The Scourge\n---\n# The Scourge\n\nParasites and host-takeover organisms. #enemy\n\nSee [[Characters/Warden Pyre|Warden Pyre]].",
  );
  write(
    path.join(vault, "Characters", "Warden Pyre.md"),
    "# Warden Pyre\n\nA survivor reading [[The-Scourge]] pressure in the ash.",
  );
  write(path.join(vault, ".obsidian", "workspace.json"), '{"ignored": true}');
  return root;
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop()!, { recursive: true, force: true });
});

test("indexes titles, tags, wiki links, and backlinks", () => {
  const repo = makeRepo();
  const lore = createLoreVaultStore({
    repos: [{ id: "deadrot", name: "Deadrot", repoPath: repo, source: "discovered" }],
  });

  const state = lore.list();

  expect(state.activeVaultId).toBe("deadrot");
  expect(state.notes.map((note) => note.path)).toEqual([
    "Characters/Warden Pyre.md",
    "Factions/The-Scourge.md",
  ]);
  expect(state.vaults[0]).toMatchObject({ exists: true, noteCount: 2 });
  expect(state.notes.find((note) => note.path === "Factions/The-Scourge.md")).toMatchObject({
    title: "The Scourge",
    folder: "Factions",
    tags: ["enemy"],
    wikiLinks: ["Characters/Warden Pyre"],
    backlinks: ["Characters/Warden Pyre.md"],
  });
});

test("serves indexed note content without reparsing until an explicit refresh", () => {
  const repo = makeRepo();
  const notePath = path.join(repo, "apps", "lore", "content", "Characters", "Warden Pyre.md");
  const lore = createLoreVaultStore({
    repos: [{ id: "deadrot", name: "Deadrot", repoPath: repo }],
  });

  lore.list("deadrot");
  write(notePath, "# Warden Pyre\n\nUpdated canon.");

  expect(lore.read("deadrot", "Characters/Warden Pyre.md")?.content).toContain("A survivor");
  lore.list("deadrot", true);
  expect(lore.read("deadrot", "Characters/Warden Pyre.md")?.content).toContain("Updated canon");
});

test("rejects paths outside the vault and reports missing vaults", () => {
  const repo = makeRepo();
  const missingRepo = tempDir();
  const lore = createLoreVaultStore({
    repos: [
      { id: "deadrot", name: "Deadrot", repoPath: repo },
      { id: "missing", name: "Missing", repoPath: missingRepo },
    ],
  });

  expect(lore.read("deadrot", "../../../package.json")).toBeNull();
  expect(lore.list("missing")).toMatchObject({
    activeVaultId: "missing",
    notes: [],
    error: "Obsidian vault not found at apps/lore/content",
  });
});
