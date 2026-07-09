import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { IPC_CHANNELS, IPC_EVENT_CHANNELS, IPC_INVOKE_CHANNELS } from "./ipc";

const mainSource = await readFile(new URL("../main/index.ts", import.meta.url), "utf8");
const terminalSource = await readFile(new URL("../main/terminal-manager.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload/index.ts", import.meta.url), "utf8");

test("IPC channel values are unique", () => {
  const channels = Object.values(IPC_CHANNELS);
  expect(new Set(channels).size).toBe(channels.length);
});

test("every invoke channel is wired through main and preload", () => {
  for (const channelKey of Object.keys(IPC_INVOKE_CHANNELS)) {
    expect(mainSource).toContain(`ipcMain.handle(IPC_CHANNELS.${channelKey}`);
    expect(preloadSource).toContain(`ipcRenderer.invoke(IPC_CHANNELS.${channelKey}`);
  }
});

test("every event channel is emitted by main and subscribed by preload", () => {
  const emitters = `${mainSource}\n${terminalSource}`;
  for (const channelKey of Object.keys(IPC_EVENT_CHANNELS)) {
    expect(emitters).toContain(`IPC_CHANNELS.${channelKey}`);
    expect(preloadSource).toContain(`IPC_CHANNELS.${channelKey}`);
  }
});
