// BYOK settings persisted in chrome.storage.local. The API key lives ONLY in
// browser runtime storage — never hardcoded, never written to the repo, never
// logged. See .claude/skills/browser-extension-dev/SKILL.md (BYOK section).

export interface Settings {
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  /** BYOK secret. Stored in chrome.storage.local only. */
  apiKey: string;
  /** Model name, e.g. gpt-4o-mini */
  model: string;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

const STORAGE_KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(raw[STORAGE_KEY] ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}
