// Content script (Manifest V3).
//
// STAGE 0 SKELETON: responds to EXTRACT requests with the current selection or a
// naive full-page text grab. Stage 1 replaces extractPageText() with a readable
// main-content extraction (e.g. Readability-style); Stage 4 adds PDF handling.
//
// The content script runs in the page's DOM but an ISOLATED JS world — it cannot
// call background functions directly, only message-pass. Keep it thin: extract
// text, hand it to the background worker, never put secrets here.

import type { ExtensionMessage, ExtractResult } from "../lib/messages.ts";

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "EXTRACT") {
      const text =
        message.source === "selection"
          ? getSelectionText()
          : extractPageText();
      const res: ExtractResult = {
        type: "EXTRACT_RESULT",
        text,
        url: location.href,
        title: document.title,
      };
      sendResponse(res);
    }
    return undefined;
  },
);

function getSelectionText(): string {
  return window.getSelection()?.toString().trim() ?? "";
}

// Naive placeholder. Stage 1: extract readable main content, strip nav/ads.
function extractPageText(): string {
  return (document.body?.innerText ?? "").trim();
}
