// Background service worker (Manifest V3).
//
// STAGE 0 SKELETON: wiring only, no summarization logic yet. Stage 1 fills in
// the LLM call in summarize().
//
// Lifecycle note: an MV3 service worker is ephemeral — it is torn down when idle
// and restarted on the next event. Never hold important state in module-level
// variables expecting it to survive; persist to chrome.storage instead. Register
// all listeners at the top level (synchronously), not inside async callbacks, so
// they are attached on every worker wake-up.

import type { ExtensionMessage, SummarizeResult } from "../lib/messages.ts";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[bg] AI Page Summarizer installed");
});

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "SUMMARIZE") {
      // Async work + sendResponse => must return true to keep the channel open.
      summarize(message.text)
        .then((summary) => {
          const res: SummarizeResult = {
            type: "SUMMARIZE_RESULT",
            ok: true,
            summary,
          };
          sendResponse(res);
        })
        .catch((err: unknown) => {
          const res: SummarizeResult = {
            type: "SUMMARIZE_RESULT",
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
          sendResponse(res);
        });
      return true;
    }
    return undefined;
  },
);

// Placeholder for Stage 1: call the configured OpenAI-compatible endpoint.
// Reads BYOK settings from chrome.storage; the key never leaves runtime storage.
async function summarize(text: string): Promise<string> {
  return `TODO(stage 1): summarize ${text.length} chars via LLM`;
}
