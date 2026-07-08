// Shared message contract between content script, popup and background service
// worker. Keeping it in one typed module prevents string-typo drift across the
// three isolated execution contexts of a Manifest V3 extension.

export type ExtractSource = "page" | "selection";

/** A hyperlink extracted from the page, used to let the LLM cite article URLs. */
export interface PageLink {
  text: string;
  href: string;
}

/** popup/content -> background: please summarize this text. */
export interface SummarizeRequest {
  type: "SUMMARIZE";
  source: ExtractSource;
  text: string;
  url?: string;
  title?: string;
  links?: PageLink[];
}

/** background -> popup: content script -> popup extraction result. */
export interface ExtractRequest {
  type: "EXTRACT";
  source: ExtractSource;
}

export interface ExtractResult {
  type: "EXTRACT_RESULT";
  text: string;
  url: string;
  title: string;
  /** Set when extraction failed (e.g. a PDF that pdf.js could not parse). */
  error?: string;
  /** Hyperlinks harvested from the page (capped), for LLM citation. */
  links?: PageLink[];
}

/** background -> caller: summary result or error. */
export interface SummarizeResult {
  type: "SUMMARIZE_RESULT";
  ok: boolean;
  summary?: string;
  error?: string;
}

/** popup -> background: abort the in-flight summarize request. */
export interface CancelRequest {
  type: "CANCEL_SUMMARIZE";
}

export type ExtensionMessage =
  | SummarizeRequest
  | ExtractRequest
  | ExtractResult
  | SummarizeResult
  | CancelRequest;
