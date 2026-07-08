// Content script (Manifest V3).
//
// Responds to EXTRACT requests with the current selection or Readability-based
// main-content extraction (see ./extract.ts). Stage 4 adds PDF handling.
//
// The content script runs in the page's DOM but an ISOLATED JS world — it cannot
// call background functions directly, only message-pass. Keep it thin: extract
// text, hand it to the background worker, never put secrets here.

import type { ExtensionMessage, ExtractResult } from "../lib/messages.ts";
import { extractPageText, getSelectionText } from "./extract.ts";

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
