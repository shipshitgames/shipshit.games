import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Renderer build/dev config for the Electron Studio shell.
export default defineConfig({
  plugins: [react()],
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
