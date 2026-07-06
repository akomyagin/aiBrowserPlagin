import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// Manifest V3. Authored as a typed TS object so version/paths are not duplicated
// and @crxjs can rewrite asset paths for the built extension.
export default defineManifest({
  manifest_version: 3,
  name: "AI Page Summarizer",
  description: pkg.description,
  version: pkg.version || "0.0.0",

  // Popup UI (Phase 1). Side panel is added in Phase 2.
  action: {
    default_title: "AI Page Summarizer",
    default_popup: "src/popup/index.html",
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
  ],

  // host_permissions is intentionally left to activeTab for Phase 1 to keep the
  // privacy footprint minimal. The LLM endpoint is reached from the service
  // worker via fetch(); the user's configured base URL does not need a static
  // host permission for a top-level fetch from the extension origin.
  host_permissions: [],
});
