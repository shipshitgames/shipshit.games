import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload/index.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../renderer/App.tsx", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../renderer/panes/ResourcesPane.tsx", import.meta.url), "utf8");

const RESOURCE_CHANNEL_KEYS = [
  "resourcesList",
  "resourcesValidate",
  "resourcesPreview",
  "resourcesReveal",
  "resourcesPromoteSkill",
];

test("main and preload wire every resources channel", () => {
  for (const channelKey of RESOURCE_CHANNEL_KEYS) {
    expect(mainSource).toContain(`ipcMain.handle(IPC_CHANNELS.${channelKey}`);
    expect(preloadSource).toContain(`ipcRenderer.invoke(IPC_CHANNELS.${channelKey}`);
  }
});

test("the renderer inventories resources through package JSON commands", () => {
  expect(appSource).toContain("resources: ResourcesPane");
  expect(rendererSource).toContain("window.studio.resources.list()");
  expect(mainSource).toContain('runResourcesCommand([kind, "--json"])');
  expect(mainSource).toContain("parseResourceInventory(kind, result.stdout)");
});

test("derivative previews cannot expose raw transcript files", () => {
  expect(mainSource).toContain("resolveResourceDerivativePath");
  expect(rendererSource).not.toContain("readFileSync(transcript");
});

test("skill approval is gated by a successful main-process review", () => {
  expect(mainSource).toContain("skillPromotionReviews.consume");
  expect(mainSource).toContain("skillPromotionReviews.record");
  expect(mainSource).toContain("resolveRealSkillCandidatePath");
});
