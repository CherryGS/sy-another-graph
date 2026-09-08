import { resolve } from "node:path";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const projectRequire = createRequire(import.meta.url);
const cosmographRequire = createRequire(
  projectRequire.resolve("@cosmograph/cosmograph"),
);
const cosmosRequire = createRequire(
  cosmographRequire.resolve("@cosmograph/cosmos"),
);

export default defineConfig({
  root: resolve(import.meta.dirname, "ui"),
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    // gl-bench's browser field selects a global script. Cosmos imports its real ESM default export.
    alias: [
      { find: "@", replacement: resolve(import.meta.dirname, "src") },
      {
        find: /^gl-bench$/,
        replacement: cosmosRequire.resolve("gl-bench/dist/gl-bench.module.js"),
      },
    ],
  },
  worker: { format: "es" },
  build: {
    outDir: resolve(import.meta.dirname, "dist/ui"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
});
