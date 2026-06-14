import { readFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";

// three.js ships its DRACO decoder + KTX2 (basis) transcoder as separate worker
// assets that DRACOLoader/KTX2Loader fetch at runtime from a configured path.
// The 3D preview pane wires them to `./decoders/<draco|basis>/` (see
// src/renderer/model-preview-config.ts), so this plugin makes those files
// available there — served from node_modules in dev, emitted into the bundle for
// the packaged file:// app — without committing vendored binaries to the repo.
const require = createRequire(import.meta.url);
const THREE_DECODERS = [
  { route: "draco", dir: "three/examples/jsm/libs/draco/", files: ["draco_wasm_wrapper.js", "draco_decoder.wasm", "draco_decoder.js"] },
  { route: "basis", dir: "three/examples/jsm/libs/basis/", files: ["basis_transcoder.js", "basis_transcoder.wasm"] },
] as const;

// Map a `/decoders/<route>/<file>` request path back to its on-disk three asset,
// or null when the path isn't a known decoder file.
function resolveDecoderRequest(pathname: string): string | null {
  for (const { route, dir, files } of THREE_DECODERS) {
    for (const file of files) {
      if (pathname === `/decoders/${route}/${file}`) return require.resolve(`${dir}${file}`);
    }
  }
  return null;
}

function bundleThreeDecoders(): Plugin {
  return {
    name: "bundle-three-decoders",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0]!;
        const file = resolveDecoderRequest(pathname);
        if (!file) return next();
        res.setHeader("Content-Type", pathname.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const { route, dir, files } of THREE_DECODERS) {
        for (const name of files) {
          this.emitFile({ type: "asset", fileName: `decoders/${route}/${name}`, source: readFileSync(require.resolve(`${dir}${name}`)) });
        }
      }
    },
  };
}

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
    bundleThreeDecoders(),
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
