import { defineConfig } from "vite";

// Firefox build (Manifest V3, Gecko). @crxjs/vite-plugin is Chrome-only, so the
// Firefox target uses a plain Vite build with explicit rollup inputs and a
// static manifest.firefox.json (copied into dist-firefox/ by scripts/build-firefox.mjs).
// See vite.config.ts for the Chrome build.
export default defineConfig({
  build: {
    outDir: "dist-firefox",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Named "popup" so Vite emits the HTML as dist-firefox/src/popup/index.html;
        // build-firefox.mjs moves it to popup.html at the root and rewrites its
        // script src. background/content are TS entrypoints emitted as [name].js.
        popup: "src/popup/index.html",
        background: "src/background/index.ts",
        content: "src/content/index.ts",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
