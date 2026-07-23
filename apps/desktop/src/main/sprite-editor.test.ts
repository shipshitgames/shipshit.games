import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createSpriteEditorStore, safeAssetPath } from "./sprite-editor";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "sprite-editor-"));
  roots.push(repoPath);
  const assets = path.join(repoPath, "src", "assets");
  fs.mkdirSync(path.join(assets, "sprites"), { recursive: true });
  fs.writeFileSync(
    path.join(assets, "sprites", "husk.webp"),
    Buffer.from("source"),
  );
  fs.writeFileSync(
    path.join(assets, "assets.json"),
    JSON.stringify({
      assets: [
        {
          id: "husk",
          kind: "sprite",
          game: "deadrot",
          path: "sprites/husk.webp",
          prompt: "parasite host",
          provider: "mock",
          dimensions: [32, 32],
          frameSize: [32, 32],
          frames: 1,
          views: ["front"],
          provenance: {
            provider: "mock",
            reproducible: true,
            promptHash: "a",
            styleSuffixHash: "b",
            date: "2026-07-22",
          },
          license: {
            tool: "mock",
            plan: "mock",
            date: "2026-07-22",
            kind: "sprite",
          },
        },
      ],
    }),
  );
  return { target: { id: "project", slug: "deadrot", repoPath }, assets };
}

test("lists and loads promoted sprite metadata with inline image data", () => {
  const { target } = fixture();
  const store = createSpriteEditorStore();
  const listed = store.list(target);
  expect(listed.assets).toHaveLength(1);
  expect(listed.assets[0]).toMatchObject({
    id: "husk",
    origin: "promoted",
    provider: "mock",
  });
  expect(
    store.load(target, { id: "husk", kind: "sprite", origin: "promoted" })
      .dataUrl,
  ).toBe(`data:image/webp;base64,${Buffer.from("source").toString("base64")}`);
});

test("saves an edited promoted sprite as a separate draft without losing provenance", async () => {
  const { target, assets } = fixture();
  const store = createSpriteEditorStore();
  const result = await store.saveDraft(
    target,
    { id: "husk", kind: "sprite", origin: "promoted" },
    Buffer.from("edited"),
  );
  expect(result.asset).toMatchObject({
    id: "husk",
    origin: "draft",
    human: { authored: true, editKind: "pixel-editor" },
  });
  expect(
    fs.readFileSync(path.join(assets, "sprites", "husk.webp"), "utf8"),
  ).toBe("source");
  expect(
    fs.readFileSync(
      path.join(assets, "drafts", "sprites", "husk.webp"),
      "utf8",
    ),
  ).toBe("edited");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(assets, "drafts", "drafts.json"), "utf8"),
  );
  expect(manifest.assets[0].provenance.provider).toBe("mock");
  expect(manifest.assets[0].license.tool).toBe("mock");
});

test("refuses manifest paths that escape the selected project", () => {
  expect(() => safeAssetPath("/safe/assets", "../secret.webp")).toThrow(
    "escapes",
  );
  expect(() => safeAssetPath("/safe/assets", "/secret.webp")).toThrow(
    "relative",
  );
});
