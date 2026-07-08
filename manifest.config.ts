import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// Manifest V3. Authored as a typed TS object so version/paths are not duplicated
// and @crxjs can rewrite asset paths for the built extension.
export default defineManifest({
  manifest_version: 3,
  name: "AI Page Summarizer",
  description: pkg.description,
  version: pkg.version || "0.0.0",

  // Popup UI (Phase 1). Side panel (Stage 6) reuses the exact same HTML page —
  // no duplicated logic; CSS makes the layout work in both fixed-320px popup and
  // variable-width side-panel contexts.
  action: {
    default_title: "AI Page Summarizer",
    default_popup: "src/popup/index.html",
  },

  side_panel: {
    default_path: "src/popup/index.html",
  },

  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },

  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],

  permissions: [
    "activeTab", // read the current tab's content on user action
    "storage", // persist BYOK settings via chrome.storage
    "scripting", // programmatic injection fallback
    "contextMenus", // "Summarize selection" right-click entry (Stage 5)
    "sidePanel", // Side Panel UI alongside the page (Stage 6)
  ],

  // The pdf.js worker is imported via Vite `?url` and emitted into assets/. MV3
  // requires it to be web-accessible so the content script's worker can load it
  // (a glob covers @crxjs/Vite hashing the filename).
  web_accessible_resources: [
    {
      resources: ["assets/*.js", "assets/*.mjs"],
      matches: ["<all_urls>"],
    },
  ],

  // host_permissions is intentionally left to activeTab for Phase 1 to keep the
  // privacy footprint minimal. The LLM endpoint is reached from the service
  // worker via fetch(); the user's configured base URL does not need a static
  // host permission for a top-level fetch from the extension origin.
  host_permissions: [],
});
