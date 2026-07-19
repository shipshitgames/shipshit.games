import { defineConfig } from "react-doctor/api";

export default defineConfig({
  supplyChain: {
    // @types/bun 1.3.14 is the latest Bun types package and is a direct,
    // dev-only toolchain dependency. Keep the supply-chain check enabled, but
    // accept the current vetted Socket score instead of disabling the gate.
    minScore: 47,
  },
  ignore: {
    // ignore.files globs are matched per-project-relative, so Nextra's
    // content/**/_meta.{js,ts} navigation files (loaded by convention, never
    // imported) get false-flagged as "unused files". Suppress those globally.
    // The apps/docs project is excluded outright by the `lint:react` script via
    // `--project`, which is the reliable way to drop a whole workspace project.
    files: ["**/_meta.js", "**/_meta.ts", "**/_meta.tsx"],
    overrides: [
      {
        // Next requires these named metadata exports in the route file.
        files: ["app/**/opengraph-image.tsx"],
        rules: ["react-doctor/only-export-components"],
      },
      {
        // These route/page files are deliberately composed as overview surfaces.
        files: ["app/page.tsx", "app/*/assets/page.tsx"],
        rules: ["react-doctor/no-giant-component"],
      },
      {
        // Independent form fields and local tool panes are clearer as local state
        // than reducer action boilerplate in these surfaces.
        files: ["app/*/assets/page.tsx", "src/renderer/App.tsx"],
        rules: ["react-doctor/prefer-useReducer"],
      },
      {
        // The protected asset lab is a client-side generator workspace; it must
        // refresh generated assets through the local API after user actions.
        files: ["app/*/assets/page.tsx"],
        rules: [
          "react-doctor/nextjs-no-client-fetch-for-server-data",
          "react-doctor/no-fetch-in-effect",
        ],
      },
      {
        // Native wheel interception is intentional: vertical wheel gestures page
        // the horizontal rail and must call preventDefault away from the edges.
        files: ["components/home/games-rail.tsx"],
        rules: [
          "react-doctor/no-initialize-state",
          "react-doctor/client-passive-event-listeners",
        ],
      },
      {
        // showModal()/close() are the native dialog API boundary; React cannot
        // express that modal state declaratively with the same behavior.
        files: ["components/assets/asset-lightbox.tsx"],
        rules: [
          "react-doctor/no-event-handler",
          "react-doctor/no-noninteractive-element-interactions",
        ],
      },
      {
        // Small visual primitive files intentionally colocate sibling components.
        files: ["components/site/atmosphere.tsx", "src/Card.tsx"],
        rules: ["react-doctor/no-multi-comp"],
      },
      {
        // Desktop and package UI are not Next apps, so next/image is not
        // available for their local/data-url imagery.
        files: ["src/Menu.tsx", "src/renderer/App.tsx"],
        rules: ["react-doctor/nextjs-no-img-element"],
      },
      {
        // Electron modal backdrops wrap nested interactive content, so replacing
        // the backdrop container with <button> would create invalid HTML.
        files: ["src/renderer/App.tsx"],
        rules: [
          "react-doctor/no-cascading-set-state",
          "react-doctor/prefer-use-effect-event",
          "react-doctor/async-await-in-loop",
          "react-doctor/prefer-tag-over-role",
        ],
      },
    ],
    rules: [
      // @electron/rebuild is loaded dynamically by apps/desktop/scripts/rebuild-native.cjs.
      "deslop/unused-dev-dependency",
    ],
  },
});
