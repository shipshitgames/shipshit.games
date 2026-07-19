// Guard: the Electron main process must install the navigation hardening on the
// window it creates (2026-07-12 security audit). index.ts needs the Electron runtime
// so it can't be imported here — assert on source, like the other wiring guards.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");

test("main imports and calls the window hardening helper", () => {
  expect(mainSource).toMatch(/import \{[^}]*\bhardenWindow\b[^}]*\} from ["']\.\/window-security["']/);
  // Called against the window's webContents with the external-link shell.
  expect(mainSource).toMatch(/hardenWindow\(\s*mainWindow\.webContents/);
});
