import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPageText, getSelectionText } from "./extract.ts";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("extractPageText", () => {
  it("returns article text when Readability finds a main article", () => {
    document.body.innerHTML = `
      <nav>Home About Contact skip this navigation</nav>
      <article>
        <h1>The Title Of This Article</h1>
        <p>This is the first substantial paragraph of the article body and it
        contains enough readable prose for Readability to treat it as content.</p>
        <p>Here is a second meaningful paragraph continuing the main article so
        the extractor confidently identifies the primary readable content region.</p>
      </article>
      <footer>Copyright boilerplate footer</footer>
    `;
    const text = extractPageText();
    expect(text).toContain("first substantial paragraph");
    expect(text).toContain("second meaningful paragraph");
  });

  it("falls back to innerText when Readability returns null (empty doc)", () => {
    // Empty body: Readability has nothing to parse and returns null.
    document.body.innerHTML = "";
    // jsdom does not implement innerText; stub it so the fallback is exercised.
    Object.defineProperty(document.body, "innerText", {
      configurable: true,
      value: "fallback body text",
    });
    expect(extractPageText()).toBe("fallback body text");
  });

  it("falls back to empty string when document.body is null", () => {
    // Simulate a detached/frameless document where body is null.
    const spy = vi.spyOn(document, "body", "get").mockReturnValue(null as unknown as HTMLElement);
    try {
      // Readability.parse() on a clone with no body also returns null, so we hit the ?? "" branch.
      expect(extractPageText()).toBe("");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("getSelectionText", () => {
  it("returns the trimmed selected text", () => {
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "  selected snippet  ",
    } as unknown as Selection);
    expect(getSelectionText()).toBe("selected snippet");
  });

  it("returns empty string when selection is empty", () => {
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "",
    } as unknown as Selection);
    expect(getSelectionText()).toBe("");
  });

  it("returns empty string when getSelection returns null", () => {
    vi.spyOn(window, "getSelection").mockReturnValue(null);
    expect(getSelectionText()).toBe("");
  });
});
