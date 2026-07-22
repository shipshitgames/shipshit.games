import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(
  new URL("./index.ts", import.meta.url),
  "utf8",
);
const preloadSource = await readFile(
  new URL("../preload/index.ts", import.meta.url),
  "utf8",
);
const paneSource = await readFile(
  new URL("../renderer/panes/SpritesPane.tsx", import.meta.url),
  "utf8",
);
const editorSource = await readFile(
  new URL("../renderer/panes/SpriteEditor.tsx", import.meta.url),
  "utf8",
);

const CHANNELS = [
  "spritesList",
  "spritesLoad",
  "spritesSaveDraft",
  "spritesPromote",
];

test("sprite editor is wired across main, preload, and renderer", () => {
  for (const channel of CHANNELS) {
    expect(mainSource).toContain(`ipcMain.handle(IPC_CHANNELS.${channel}`);
    expect(preloadSource).toContain(
      `ipcRenderer.invoke(IPC_CHANNELS.${channel}`,
    );
  }
  expect(paneSource).toContain("<SpriteEditor");
  expect(editorSource).toContain("Save palette-locked draft");
  expect(editorSource).toContain("Promote approved draft");
});

test("desktop sprite generation stages drafts instead of registering finals", () => {
  expect(paneSource).toMatch(/kind:\s*"sprite"[\s\S]*draft:\s*true/);
});
