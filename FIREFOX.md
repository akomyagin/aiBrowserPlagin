# Firefox support

The extension ships a second build target for Firefox (Manifest V3, Gecko).
Firefox supports MV3 since v109, but `@crxjs/vite-plugin` is Chrome-only, so the
Firefox build uses a plain Vite config plus a static manifest.

## Build

```bash
npm run build:firefox      # → dist-firefox/
npm run build:all          # Chrome (dist/) + Firefox (dist-firefox/)
```

`build:firefox` runs `vite build --config vite.config.firefox.ts`, then
`scripts/build-firefox.mjs` copies `manifest.firefox.json` → `dist-firefox/manifest.json`
and relocates the popup HTML to `dist-firefox/popup.html`.

## Test / load

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Select `dist-firefox/manifest.json`

The add-on stays loaded until Firefox restarts (temporary add-on).

## Differences from the Chrome build

- **No Side Panel.** Firefox has no `chrome.sidePanel` API. The Firefox manifest
  omits the `sidePanel` permission and `side_panel` key; the background script
  guards the `chrome.sidePanel` call with optional chaining so it no-ops on Firefox.
  The UI is popup-only there.
- **`browser_specific_settings.gecko`** pins an extension id and
  `strict_min_version: 109.0` (first Firefox with MV3).
- **Static manifest** (`manifest.firefox.json`) instead of the typed
  `manifest.config.ts` that `@crxjs` consumes for Chrome.

## Shared behavior

- Same source files — only the build config and manifest differ; no code duplication.
- `chrome.storage.session` (used for the pending context-menu selection) is
  supported in Firefox since v108, so no changes were needed.
- The pdf.js worker is imported via Vite `?url` and emitted into `assets/`; the
  Firefox manifest exposes `assets/*` as `web_accessible_resources`.

## Tested on

Firefox 109+.
