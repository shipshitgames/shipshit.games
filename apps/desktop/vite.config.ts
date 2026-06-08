import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";

// Native addons + node builtins must stay external from the main/preload bundles:
// node-pty is a compiled .node addon (rebuilt against Electron's ABI, asar-unpacked),
// and electron itself is provided by the runtime, never bundled.
const NATIVE_EXTERNALS = [
  "electron",
  "node-pty",
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

// Renderer + Electron (main/preload) build config for the Studio shell.
// The main process is bundled from TypeScript (vite-plugin-electron) so it can
// import shared packages like @shipshitgames/assetgen directly instead of shipping
// a hand-written CommonJS copy. CJS output (.cjs) keeps it loadable under the
// package's "type": "module".
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "src/main/index.ts",
        vite: {
          build: {
            outDir: "dist/main",
            sourcemap: true,
            lib: {
              entry: "src/main/index.ts",
              formats: ["cjs"],
              fileName: () => "index.cjs",
            },
            rollupOptions: {
              external: NATIVE_EXTERNALS,
              output: { format: "cjs" },
            },
            commonjsOptions: { ignoreDynamicRequires: true },
          },
        },
      },
      {
        entry: "src/preload/index.ts",
        vite: {
          build: {
            outDir: "dist/preload",
            sourcemap: true,
            lib: {
              entry: "src/preload/index.ts",
              formats: ["cjs"],
              fileName: () => "index.cjs",
            },
            rollupOptions: {
              external: NATIVE_EXTERNALS,
              output: { format: "cjs" },
            },
          },
        },
      },
      // Terminal ABI verify harness — bundled (terminal-manager inlined) so it can run
      // under Electron's raw node, which can't load TypeScript. See verify:terminal.
      {
        entry: "scripts/verify-terminal.ts",
        vite: {
          build: {
            outDir: "dist/verify",
            sourcemap: true,
            lib: {
              entry: "scripts/verify-terminal.ts",
              formats: ["cjs"],
              fileName: () => "index.cjs",
            },
            rollupOptions: {
              external: NATIVE_EXTERNALS,
              output: { format: "cjs" },
            },
            commonjsOptions: { ignoreDynamicRequires: true },
          },
        },
      },
    ]),
  ],
  // Relative base so the built index.html loads its assets correctly when
  // opened from the filesystem via `loadFile` in the packaged app.
  base: "./",
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    sourcemap: true,
  },
});
