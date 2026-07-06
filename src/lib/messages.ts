// Shared message contract between content script, popup and background service
// worker. Keeping it in one typed module prevents string-typo drift across the
// three isolated execution contexts of a Manifest V3 extension.

export type ExtractSource = "page" | "selection";

/** popup/content -> background: please summarize this text. */
export interface SummarizeRequest {
  type: "SUMMARIZE";
  source: ExtractSource;
  text: string;
  url?: string;
  title?: string;
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
}

/** background -> caller: summary result or error. */
export interface SummarizeResult {
  type: "SUMMARIZE_RESULT";
  ok: boolean;
  summary?: string;
  error?: string;
}

export type ExtensionMessage =
  | SummarizeRequest
  | ExtractRequest
  | ExtractResult
  | SummarizeResult;
