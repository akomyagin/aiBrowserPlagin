// Popup UI (Manifest V3).
//
// STAGE 0 SKELETON: plain TypeScript, no framework. Justification: the popup is a
// tiny surface (one button, a result area, a small settings form). React would
// add bundle weight and build complexity for near-zero benefit at MVP scope. If
// the side panel (Phase 2) grows into a richer UI, revisit then.
//
// Flow (wired in Stage 1): popup asks the active tab's content script to EXTRACT,
// then forwards the text to the background worker for SUMMARIZE, then renders the
// result. Stage 2 adds the BYOK settings view (base URL, API key, model).
//
// BYOK invariant: the API key input value is read only at save time and passed
// straight to saveSettings; the field is never pre-filled with the stored key and
// the key is never logged.

import type {
  CancelRequest,
  ExtractRequest,
  ExtractResult,
  SummarizeRequest,
  SummarizeResult,
} from "../lib/messages.ts";
import { loadSettings, saveSettings } from "../lib/settings.ts";

const button = document.getElementById("summarize") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLDivElement;
const output = document.getElementById("summary") as HTMLDivElement;

/** Set the status line, toggling the animated-ellipsis loading class. */
function setStatus(text: string): void {
  status.textContent = text;
  status.classList.toggle("loading", text.length > 0);
}

const mainView = document.getElementById("main-view") as HTMLDivElement;
const settingsView = document.getElementById("settings-view") as HTMLDivElement;
const settingsToggle = document.getElementById(
  "settings-toggle",
) as HTMLButtonElement;
const saveBtn = document.getElementById("s-save") as HTMLButtonElement;
const backBtn = document.getElementById("s-back") as HTMLButtonElement;
const baseUrlInput = document.getElementById("s-base-url") as HTMLInputElement;
const apiKeyInput = document.getElementById("s-api-key") as HTMLInputElement;
const modelInput = document.getElementById("s-model") as HTMLInputElement;
const sStatus = document.getElementById("s-status") as HTMLDivElement;

const KEY_SAVED_PLACEHOLDER = "••••••• (saved, enter new to change)";
const KEY_EMPTY_PLACEHOLDER = "sk-...";
const NO_KEY_MESSAGE = "No API key configured. Click ⚙ to open Settings.";

let showingNoKeyWarning = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let wasCancelled = false;

button.addEventListener("click", () => {
  void handleSummarize();
});
cancelBtn.addEventListener("click", () => {
  wasCancelled = true;
  void chrome.runtime.sendMessage({
    type: "CANCEL_SUMMARIZE",
  } satisfies CancelRequest);
  cancelBtn.hidden = true;
  button.disabled = false;
  setStatus("");
  output.textContent = "Cancelled.";
  showingNoKeyWarning = false;
});
settingsToggle.addEventListener("click", () => {
  void showView("settings");
});
backBtn.addEventListener("click", () => {
  showView("main");
});
saveBtn.addEventListener("click", () => {
  void handleSave();
});

/** Populate the settings fields from storage. Never fills the API key field. */
async function fillSettingsFields(): Promise<void> {
  const s = await loadSettings();
  baseUrlInput.value = s.baseUrl;
  modelInput.value = s.model;
  apiKeyInput.value = "";
  apiKeyInput.placeholder = s.apiKey
    ? KEY_SAVED_PLACEHOLDER
    : KEY_EMPTY_PLACEHOLDER;
}

async function init(): Promise<void> {
  const s = await loadSettings();
  baseUrlInput.value = s.baseUrl;
  modelInput.value = s.model;
  apiKeyInput.value = "";
  apiKeyInput.placeholder = s.apiKey
    ? KEY_SAVED_PLACEHOLDER
    : KEY_EMPTY_PLACEHOLDER;

  if (s.apiKey === "") {
    output.textContent = NO_KEY_MESSAGE;
    output.classList.add("muted");
    showingNoKeyWarning = true;
  }
}

function showView(v: "main" | "settings"): void {
  if (v === "settings" && saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  mainView.hidden = v !== "main";
  settingsView.hidden = v !== "settings";
  if (v === "settings") {
    sStatus.textContent = "";
    fillSettingsFields().catch(() => {
      sStatus.textContent = "Failed to load settings.";
    });
  }
}

async function handleSave(): Promise<void> {
  const baseUrl = baseUrlInput.value.trim();
  const model = modelInput.value.trim();
  const keyEntry = apiKeyInput.value.trim();

  try {
    new URL(baseUrl);
  } catch {
    sStatus.textContent = "Invalid Base URL.";
    return;
  }
  if (model === "") {
    sStatus.textContent = "Model must not be empty.";
    return;
  }

  // Empty key field means "keep the existing key".
  const existing = await loadSettings();
  const apiKey = keyEntry === "" ? existing.apiKey : keyEntry;

  await saveSettings({ baseUrl, apiKey, model });

  apiKeyInput.value = "";
  apiKeyInput.placeholder = apiKey
    ? KEY_SAVED_PLACEHOLDER
    : KEY_EMPTY_PLACEHOLDER;

  // Clear the "no key" warning now that a key is configured.
  if (apiKey && showingNoKeyWarning) {
    output.textContent = 'Click "Summarize page" to begin.';
    output.classList.add("muted");
    showingNoKeyWarning = false;
  }

  sStatus.textContent = "Saved.";
  saveTimer = setTimeout(() => {
    saveTimer = null;
    sStatus.textContent = "";
    showView("main");
  }, 2000);
}

async function handleSummarize(): Promise<void> {
  wasCancelled = false;
  button.disabled = true;
  cancelBtn.hidden = false;
  setStatus("Extracting");
  output.textContent = "";
  output.classList.remove("muted");
  showingNoKeyWarning = false;

  try {
    const s = await loadSettings();
    if (!s.apiKey) {
      setStatus("");
      output.textContent = NO_KEY_MESSAGE;
      output.classList.add("muted");
      showingNoKeyWarning = true;
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab.id) {
      setStatus("");
      output.textContent = "No active tab.";
      return;
    }

    const extractReq: ExtractRequest = { type: "EXTRACT", source: "page" };
    const extracted = (await chrome.tabs.sendMessage(
      tab.id,
      extractReq,
    )) as ExtractResult;

    setStatus("Summarizing");

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

    if (!wasCancelled) {
      setStatus("");
      output.textContent = result.ok
        ? (result.summary ?? "")
        : `Error: ${result.error}`;
    }
  } catch (err: unknown) {
    if (!wasCancelled) {
      const msg = err instanceof Error ? err.message : String(err);
      const isMissingContentScript =
        msg.includes("Could not establish connection") ||
        msg.includes("Receiving end does not exist");
      output.textContent = isMissingContentScript
        ? "This extension cannot summarize browser pages (chrome://, about:, extension pages)."
        : `Error: ${msg}`;
    }
  } finally {
    button.disabled = false;
    cancelBtn.hidden = true;
    setStatus("");
    wasCancelled = false;
  }
}

void init();
