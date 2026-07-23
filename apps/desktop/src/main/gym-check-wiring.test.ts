// Guard: gym checks (#305) must stay wired from the main-process runner through
// preload. index.ts itself needs Electron, so assert the contract on source,
// like gyms-wiring.test.ts and lab-wiring.test.ts.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload/index.ts", import.meta.url), "utf8");

const CHECK_CHANNEL_KEYS = [
  "gymsCheckStart",
  "gymsCheckList",
  "gymsCheckGet",
  "gymsCheckStop",
  "gymsCheckImage",
];

test("main constructs the gym-check runner from the shared factory", () => {
  expect(mainSource).toMatch(/import \{[^}]*\bcreateGymCheckRunner\b[^}]*\} from ["']\.\/gym-check["']/);
  expect(mainSource).toMatch(/createGymCheckRunner\(\s*\{/);
  // Run records live under the Studio's userData — never inside a game repo.
  expect(mainSource).toMatch(/getPath\("userData"\),\s*"gym-checks"/);
  expect(mainSource).toContain("testerCommand: () => toolingRuntime.tester");
  expect(mainSource).not.toContain("packages/tester/src/cli.ts");
});

test("main handles every gyms:check* channel the preload exposes", () => {
  for (const channelKey of CHECK_CHANNEL_KEYS) {
    expect(mainSource).toContain(`ipcMain.handle(IPC_CHANNELS.${channelKey}`);
    expect(preloadSource).toContain(`ipcRenderer.invoke(IPC_CHANNELS.${channelKey}`);
  }
});

test("check progress events flow from main to the preload subscription", () => {
  expect(mainSource).toContain("IPC_CHANNELS.gymsCheckEvent");
  expect(preloadSource).toMatch(/IPC(?:_EVENT)?_CHANNELS\.gymsCheckEvent\b/);
});

test("preload exposes a gymChecks bridge and event subscription", () => {
  expect(preloadSource).toMatch(/\bgymChecks:\s*\{/);
  expect(preloadSource).toMatch(/\bonGymCheckEvent:/);
});

test("main disposes live checks beside the terminal disposals", () => {
  expect(mainSource).toMatch(/before-quit[\s\S]{0,160}gymChecks\.disposeAll\(\)/);
  expect(mainSource).toMatch(/"closed"[\s\S]{0,160}gymChecks\.disposeAll\(\)/);
});
