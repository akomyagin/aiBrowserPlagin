import { defineConfig } from "vitest/config";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.ts";

// This is the Chrome (MV3) build. The Firefox target uses a separate, @crxjs-free
// config: see vite.config.firefox.ts + manifest.firefox.json (npm run build:firefox).

// @crxjs/vite-plugin wires the Manifest V3 build: it reads the typed manifest,
// bundles the background service worker / content scripts / popup HTML entry,
// rewrites asset paths, and (in `vite dev`) provides HMR for the extension.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    // Extensions load unbundled from dist/; keep output deterministic.
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
