// Pure DOM text-extraction helpers for the content script.
//
// Split out from index.ts so they can be unit-tested under jsdom without the
// content script's top-level chrome.runtime listener (chrome is undefined in
// tests). These functions touch only the DOM, never chrome APIs or secrets.

import { Readability } from "@mozilla/readability";
// The pdf.js worker is imported as a URL (Vite `?url`) so it ships as a separate
// asset and loads from web_accessible_resources. In MV3 the worker MUST NOT be
// an inlined blob/eval worker — the extension CSP blocks those. pdfjs-dist
// itself is loaded lazily (dynamic import) inside extractPdfText() so the
// non-PDF path and jsdom unit tests never pull in its DOMMatrix-dependent runtime.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageLink } from "../lib/messages.ts";

export type { PageLink };

export function getSelectionText(): string {
  return window.getSelection()?.toString().trim() ?? "";
}

// Harvest visible hyperlinks from the page so the LLM can cite article URLs in
// its summary (Readability strips hrefs). Only absolute http(s) links with
// meaningful anchor text are kept; duplicates are dropped and the list is capped
// to fit the token budget.
export function extractPageLinks(): PageLink[] {
  const seen = new Set<string>();
  const links: PageLink[] = [];
  document.querySelectorAll("a[href]").forEach((el) => {
    const anchor = el as HTMLAnchorElement;
    const href = anchor.href; // already absolute
    const text = anchor.textContent?.trim() ?? "";
    if (!href.startsWith("http") || !text || text.length < 10 || seen.has(href))
      return;
    seen.add(href);
    links.push({ text, href });
  });
  return links.slice(0, 60); // cap at 60 (~3 KB at avg 50 chars/link, fits token budget)
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

// Detect whether the current tab is a PDF: an explicit .pdf URL (with or without
// a query string), or the browser's built-in viewer which reports the document
// contentType as application/pdf.
export function isPdfPage(): boolean {
  const url = location.href.toLowerCase();
  return (
    url.endsWith(".pdf") ||
    url.includes(".pdf?") ||
    document.contentType === "application/pdf"
  );
}

// Extract text from the PDF in the current tab via pdf.js. Loads the document
// from location.href (the built-in viewer navigates the tab to the PDF URL),
// then concatenates the text of every page. Pages are separated by newlines,
// text runs within a page by spaces.
export async function extractPdfText(): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const doc = await pdfjsLib.getDocument(location.href).promise;
  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    pages.push(pageText);
  }
  return pages.join("\n").trim();
}
