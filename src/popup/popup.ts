// Popup UI (Manifest V3).
//
// STAGE 0 SKELETON: plain TypeScript, no framework. Justification: the popup is a
// tiny surface (one button, a result area, a small settings form later). React
// would add bundle weight and build complexity for near-zero benefit at MVP
// scope. If the side panel (Phase 2) grows into a richer UI, revisit then.
//
// Flow (wired in Stage 1): popup asks the active tab's content script to EXTRACT,
// then forwards the text to the background worker for SUMMARIZE, then renders the
// result. Stage 0 only proves the button + DOM wiring compile and load.

import type {
  ExtractRequest,
  ExtractResult,
  SummarizeRequest,
  SummarizeResult,
} from "../lib/messages.ts";

const button = document.getElementById("summarize") as HTMLButtonElement;
const output = document.getElementById("summary") as HTMLDivElement;

button.addEventListener("click", () => {
  void handleSummarize();
});

async function handleSummarize(): Promise<void> {
  output.textContent = "Extracting…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) {
    output.textContent = "No active tab.";
    return;
  }

  const extractReq: ExtractRequest = { type: "EXTRACT", source: "page" };
  const extracted = (await chrome.tabs.sendMessage(
    tab.id,
    extractReq,
  )) as ExtractResult;

  const summarizeReq: SummarizeRequest = {
    type: "SUMMARIZE",
    source: "page",
    text: extracted.text,
    url: extracted.url,
    title: extracted.title,
  };
  const result = (await chrome.runtime.sendMessage(
    summarizeReq,
  )) as SummarizeResult;

  output.textContent = result.ok
    ? (result.summary ?? "")
    : `Error: ${result.error}`;
}
