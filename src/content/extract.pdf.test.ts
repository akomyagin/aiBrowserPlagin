import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the pdf.js worker `?url` import — Vite resolves this to a URL string at
// build time, but under Vitest the raw ?url module does not exist.
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "chrome-extension://test/assets/pdf.worker.min.mjs",
}));

// Controllable pdf.js fake. Tests set `pdfPages` (array of page text arrays) or
// `pdfError` to drive getDocument behaviour.
const { getDocumentMock, workerOptions } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  workerOptions: { workerSrc: "" as string },
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: workerOptions,
  getDocument: getDocumentMock,
}));

import { extractPdfText, isPdfPage } from "./extract.ts";

function setUrl(href: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href } as Location,
  });
}

// Build a fake PDFDocumentProxy whose pages return the given text runs.
function fakeDocument(pages: string[][]) {
  return {
    numPages: pages.length,
    getPage: (n: number) =>
      Promise.resolve({
        getTextContent: () =>
          Promise.resolve({
            items: pages[n - 1].map((str) => ({ str })),
          }),
      }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  getDocumentMock.mockReset();
});

describe("isPdfPage", () => {
  it("returns true for a .pdf URL", () => {
    setUrl("https://example.com/report.pdf");
    expect(isPdfPage()).toBe(true);
  });

  it("returns true for a .pdf URL with a query string", () => {
    setUrl("https://example.com/report.pdf?page=1");
    expect(isPdfPage()).toBe(true);
  });

  it("returns false for a regular .html URL", () => {
    setUrl("https://example.com/article.html");
    expect(isPdfPage()).toBe(false);
  });

  it("returns true when document.contentType is application/pdf", () => {
    setUrl("https://example.com/viewer");
    Object.defineProperty(document, "contentType", {
      configurable: true,
      value: "application/pdf",
    });
    expect(isPdfPage()).toBe(true);
  });
});

describe("extractPdfText", () => {
  beforeEach(() => {
    setUrl("https://example.com/doc.pdf");
    workerOptions.workerSrc = "";
  });

  it("sets the worker src to the imported worker URL", async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(fakeDocument([["hi"]])) });
    await extractPdfText();
    expect(workerOptions.workerSrc).toBe(
      "chrome-extension://test/assets/pdf.worker.min.mjs",
    );
  });

  it("joins page text with newlines and runs with spaces", async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve(
        fakeDocument([
          ["Hello", "world"],
          ["Second", "page"],
        ]),
      ),
    });
    expect(await extractPdfText()).toBe("Hello world\nSecond page");
  });

  it("returns an empty string for a PDF with zero pages", async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(fakeDocument([])) });
    expect(await extractPdfText()).toBe("");
  });

  it("propagates a pdf.js error", async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.reject(new Error("corrupt pdf")),
    });
    await expect(extractPdfText()).rejects.toThrow("corrupt pdf");
  });
});
