// Pure DOM text-extraction helpers for the content script.
//
// Split out from index.ts so they can be unit-tested under jsdom without the
// content script's top-level chrome.runtime listener (chrome is undefined in
// tests). These functions touch only the DOM, never chrome APIs or secrets.

import { Readability } from "@mozilla/readability";

export function getSelectionText(): string {
  return window.getSelection()?.toString().trim() ?? "";
}

// Extract readable main content via Readability, stripping nav/ads/boilerplate.
// Parse a clone so the live page DOM is never mutated. Falls back to raw
// innerText when Readability can't find an article (e.g. sparse/empty pages).
export function extractPageText(): string {
  const docClone = document.cloneNode(true) as Document;
  const article = new Readability(docClone).parse();
  if (article?.textContent) return article.textContent.trim();
  return (document.body?.innerText ?? "").trim();
}
