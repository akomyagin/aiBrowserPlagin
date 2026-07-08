// LLM summarization logic, extracted from the service worker for testability.
//
// This module is pure with respect to browser APIs: it takes `settings`
// explicitly (never reads chrome.storage itself) and an `AbortSignal` for
// cancellation/timeout. That keeps it unit-testable with a mocked global
// `fetch` and no chrome shims.
//
// BYOK invariant: the API key arrives via the `settings` argument and is used
// only in the Authorization header. It is NEVER logged (no console.*), not even
// partially.

import type { PageLink } from "../lib/messages.ts";
import type { Settings } from "../lib/settings.ts";

/** Hard cap on characters sent to the LLM (rough token-budget guard). */
export const MAX_TEXT_CHARS = 50_000;

/** Request timeout enforced by the caller via AbortController. */
export const TIMEOUT_MS = 30_000;

const TRUNCATION_MARKER = "\n\n[...content truncated...]\n\n";

/**
 * Truncate text to MAX_TEXT_CHARS, keeping head and tail and marking the cut.
 * Short text is returned unchanged.
 */
export function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  const keep = MAX_TEXT_CHARS - TRUNCATION_MARKER.length;
  const headLen = Math.ceil(keep / 2);
  const tailLen = keep - headLen;
  const head = text.slice(0, headLen);
  const tail = text.slice(text.length - tailLen);
  return head + TRUNCATION_MARKER + tail;
}

/** Map an HTTP failure status to a user-facing error message. */
export function httpErrorMessage(status: number, statusText: string): string {
  switch (status) {
    case 401:
      return "Invalid API key. Check your settings (⚙).";
    case 403:
      return "Access forbidden. Check API key permissions.";
    case 429:
      return "Rate limit exceeded. Wait a moment and try again.";
    default:
      if (status >= 500) {
        return `LLM service error (${status}). Try again later.`;
      }
      return `Request failed (HTTP ${status}: ${statusText}).`;
  }
}

const SYSTEM_PROMPT =
  "You are a helpful assistant. Summarize the web page content concisely " +
  "(3-5 bullet points or 2-3 short paragraphs). Respond in the same language " +
  "as the content. When summarizing pages that list articles or posts, include " +
  "the relevant URL as a Markdown link [title](url) using the URLs provided in " +
  "'Links on this page'. Only link to URLs that were explicitly provided.";

/**
 * Call an OpenAI-compatible /chat/completions endpoint and return the summary.
 * Throws Error with a user-facing message on any failure.
 */
export async function callLLM(
  text: string,
  url: string | undefined,
  title: string | undefined,
  settings: Settings,
  signal: AbortSignal,
  links?: PageLink[],
): Promise<string> {
  if (settings.apiKey === "") {
    throw new Error("API key not configured. Open extension settings (⚙).");
  }

  const linksSection = links?.length
    ? "\n\nLinks on this page:\n" +
      links.map((l) => `- ${l.text}: ${l.href}`).join("\n")
    : "";
  const content = truncateText(
    [title, url, text].filter(Boolean).join("\n") + linksSection,
  );
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content },
  ];

  let response: Response;
  try {
    response = await fetch(settings.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settings.apiKey,
      },
      body: JSON.stringify({ model: settings.model, messages }),
      signal,
    });
  } catch (err: unknown) {
    if (
      (err instanceof Error || err instanceof DOMException) &&
      err.name === "AbortError"
    ) {
      throw new Error(`Request timed out after ${TIMEOUT_MS / 1000} seconds.`);
    }
    if (err instanceof Error && err.message.includes("Failed to fetch")) {
      throw new Error("Network error. Check your internet connection.");
    }
    throw err;
  }

  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status, response.statusText));
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const summary = data.choices?.[0]?.message?.content;
  if (typeof summary !== "string" || summary.trim() === "") {
    throw new Error("Unexpected API response format");
  }
  return summary.trim();
}
