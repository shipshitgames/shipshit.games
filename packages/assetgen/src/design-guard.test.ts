import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { findDisallowedDesignDocs } from "./design-guard";

test("design guard permits the reviewed root DESIGN.md while lore is unwired", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-design-guard-"));
  await writeFile(join(root, "DESIGN.md"), "---\nversion: 1\n---\n");

  const violations = await findDisallowedDesignDocs(root);
  assert.deepEqual(violations, []);
});

test("design guard rejects frontmatter DESIGN.md copies outside lore", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-design-guard-"));
  await mkdir(join(root, "packages", "ui"), { recursive: true });
  await writeFile(join(root, "packages", "ui", "DESIGN.md"), "---\nversion: 1\n---\n");

  const violations = await findDisallowedDesignDocs(root);
  assert.deepEqual(violations, [{ path: "packages/ui/DESIGN.md" }]);
});

test("design guard permits canonical lore design paths when root is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-design-guard-"));
  await mkdir(join(root, "lore"), { recursive: true });
  await mkdir(join(root, ".agents", "lore"), { recursive: true });
  await writeFile(join(root, "lore", "DESIGN.md"), "---\nversion: 1\n---\n");
  await writeFile(join(root, ".agents", "lore", "DESIGN.md"), "---\nversion: 1\n---\n");

  const violations = await findDisallowedDesignDocs(root);
  assert.deepEqual(violations, []);
});

test("design guard rejects root DESIGN.md once lore DESIGN.md is wired", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-design-guard-"));
  await mkdir(join(root, "lore"), { recursive: true });
  await writeFile(join(root, "DESIGN.md"), "---\nversion: 1\n---\n");
  await writeFile(join(root, "lore", "DESIGN.md"), "---\nversion: 1\n---\n");

  const violations = await findDisallowedDesignDocs(root);
  assert.deepEqual(violations, [{ path: "DESIGN.md" }]);
});

test("design guard ignores non-frontmatter DESIGN.md notes", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-design-guard-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "DESIGN.md"), "# Notes\n");

  const violations = await findDisallowedDesignDocs(root);
  assert.deepEqual(violations, []);
});

test("design guard ignores DESIGN.md copies inside local git worktrees", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-design-guard-"));
  await writeFile(join(root, "DESIGN.md"), "---\nversion: 1\n---\n");
  await mkdir(join(root, ".worktrees", "feat-x"), { recursive: true });
  await writeFile(join(root, ".worktrees", "feat-x", "DESIGN.md"), "---\nversion: 1\n---\n");

  const violations = await findDisallowedDesignDocs(root);
  assert.deepEqual(violations, []);
});
