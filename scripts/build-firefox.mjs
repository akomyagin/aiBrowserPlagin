// Post-build step for the Firefox target.
//
// The plain Vite build (vite.config.firefox.ts) emits:
//   dist-firefox/background.js
//   dist-firefox/content.js
//   dist-firefox/src/popup/index.html   (referencing the emitted popup JS)
//   dist-firefox/assets/*
//
// This script finalizes the package into the layout manifest.firefox.json expects:
//   1. copy manifest.firefox.json -> dist-firefox/manifest.json
//   2. move src/popup/index.html  -> dist-firefox/popup.html
//   3. drop the now-empty dist-firefox/src tree
import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "fs";

const OUT = "dist-firefox";

// 1. Manifest
copyFileSync("manifest.firefox.json", `${OUT}/manifest.json`);

// 2. Popup HTML: Vite emits it under src/popup/index.html. Read it, then write
//    it at the root as popup.html. Vite already rewrote the <script> src to a
//    root-relative or ./ path pointing at the emitted popup JS, so no path
//    rewrite is needed beyond relocating the file — but the emitted script paths
//    are relative to the HTML's original nested location, so normalize any
//    "../../" prefixes that would break at the root.
const nestedHtml = `${OUT}/src/popup/index.html`;
if (!existsSync(nestedHtml)) {
  throw new Error(
    `Expected ${nestedHtml} from the Vite build; check vite.config.firefox.ts inputs`,
  );
}
let html = readFileSync(nestedHtml, "utf8");
// Rewrite asset references that climb out of src/popup back to the bundle root.
html = html.replace(/(?:\.\.\/)+/g, "./");
writeFileSync(`${OUT}/popup.html`, html);

// 3. Remove the leftover nested src/ tree.
rmSync(`${OUT}/src`, { recursive: true, force: true });

console.log("Firefox build in dist-firefox/");
console.log(
  "Load as temporary add-on: about:debugging → Load Temporary Add-on → dist-firefox/manifest.json",
);
