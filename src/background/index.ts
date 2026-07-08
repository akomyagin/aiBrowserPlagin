// Background service worker (Manifest V3).
//
// Lifecycle note: an MV3 service worker is ephemeral — it is torn down when idle
// and restarted on the next event. Never hold important state in module-level
// variables expecting it to survive; persist to chrome.storage instead. Register
// all listeners at the top level (synchronously), not inside async callbacks, so
// they are attached on every worker wake-up.
//
// The actual LLM call lives in ./summarize.ts (testable, browser-API-free). This
// module is the thin adapter: it reads BYOK settings from chrome.storage right
// before the call, wires up an AbortController for timeout/cancellation, and maps
// the outcome onto the typed SummarizeResult message.

import type {
  ExtensionMessage,
  ExtractRequest,
  ExtractResult,
  PageLink,
  SummarizeResult,
} from "../lib/messages.ts";
import { loadSettings } from "../lib/settings.ts";
import { callLLM, TIMEOUT_MS } from "./summarize.ts";

const CONTEXT_MENU_ID = "summarize-selection";

// Transient handle to the in-flight request's controller. Not durable state —
// only meaningful while the worker is alive handling one summarize call.
let activeController: AbortController | null = null;

chrome.runtime.onInstalled.addListener(() => {
  console.info("[bg] AI Page Summarizer installed");
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Summarize selection",
    contexts: ["selection"],
  });
  // Stage 6: keep the popup as the default action-click behavior. The side panel
  // (same HTML page) is opened manually by the user via Chrome's side-panel icon.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

// Right-click "Summarize selection". An MV3 background worker cannot open the
// popup directly, so instead of opening it we ask the content script for the
// selected text and stash it in chrome.storage.session under `pendingSelection`.
// When the user opens the popup, its init() picks up that key and runs the
// summarize flow (see popup.ts). Registered synchronously at top level so it is
// re-attached on every worker wake-up.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  void handleContextMenuClick(tab.id);
});

async function handleContextMenuClick(tabId: number): Promise<void> {
  const extractReq: ExtractRequest = { type: "EXTRACT", source: "selection" };
  try {
    const extracted = (await chrome.tabs.sendMessage(
      tabId,
      extractReq,
    )) as ExtractResult;
    await chrome.storage.session.set({
      pendingSelection: {
        text: extracted.text,
        url: extracted.url,
        title: extracted.title,
      },
    });
  } catch (err: unknown) {
    // Content script unreachable (chrome://, extension pages). Persist an empty
    // selection so the popup can surface a friendly message rather than hang.
    console.warn("[bg] selection extract failed:", err);
    await chrome.storage.session.set({
      pendingSelection: { text: "", url: "", title: "" },
    });
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "SUMMARIZE") {
      // Async work + sendResponse => must return true to keep the channel open.
      summarize(message.text, message.url, message.title, message.links)
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
    if (message.type === "CANCEL_SUMMARIZE") {
      // Synchronous handler: abort the in-flight request, if any.
      activeController?.abort();
      activeController = null;
      return undefined;
    }
    return undefined;
  },
);

// Reads BYOK settings from chrome.storage; the key never leaves runtime storage
// and is never logged.
async function summarize(
  text: string,
  url: string | undefined,
  title: string | undefined,
  links?: PageLink[],
): Promise<string> {
  const settings = await loadSettings();

  // Abort any prior in-flight request (worker may still be alive from a rapid
  // second click) before starting a new one.
  activeController?.abort();

  const controller = new AbortController();
  activeController = controller;
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await callLLM(text, url, title, settings, controller.signal, links);
  } finally {
    clearTimeout(timeout);
    activeController = null;
  }
}
