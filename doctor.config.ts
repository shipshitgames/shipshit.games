import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {
    // ignore.files globs are matched per-project-relative, so Nextra's
    // content/**/_meta.{js,ts} navigation files (loaded by convention, never
    // imported) get false-flagged as "unused files". Suppress those globally.
    // The apps/docs project is excluded outright by the `lint:react` script via
    // `--project`, which is the reliable way to drop a whole workspace project.
    files: ["**/_meta.js", "**/_meta.ts", "**/_meta.tsx"],
  },
});
