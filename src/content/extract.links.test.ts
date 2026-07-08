import { afterEach, describe, expect, it } from "vitest";
import { extractPageLinks } from "./extract.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("extractPageLinks", () => {
  it("returns absolute http links with their anchor text", () => {
    document.body.innerHTML = `
      <a href="https://example.com/article-one">First Article Title</a>
      <a href="https://example.com/article-two">Second Article Title</a>
    `;
    const links = extractPageLinks();
    expect(links).toEqual([
      { text: "First Article Title", href: "https://example.com/article-one" },
      { text: "Second Article Title", href: "https://example.com/article-two" },
    ]);
  });

  it("dedupes repeated hrefs", () => {
    document.body.innerHTML = `
      <a href="https://example.com/same-link">Read the full story now</a>
      <a href="https://example.com/same-link">Read the full story now</a>
    `;
    expect(extractPageLinks()).toHaveLength(1);
  });

  it("skips anchor text shorter than 10 characters", () => {
    document.body.innerHTML = `<a href="https://example.com/short">Home</a>`;
    expect(extractPageLinks()).toHaveLength(0);
  });

  it("skips non-http links (mailto, javascript, relative)", () => {
    document.body.innerHTML = `
      <a href="mailto:someone@example.com">Email us right here</a>
      <a href="javascript:void(0)">Click here to do stuff</a>
    `;
    expect(extractPageLinks()).toHaveLength(0);
  });

  it("caps the result at 30 links", () => {
    document.body.innerHTML = Array.from({ length: 40 })
      .map(
        (_, i) =>
          `<a href="https://example.com/article-${i}">Long enough title ${i}</a>`,
      )
      .join("");
    expect(extractPageLinks()).toHaveLength(30);
  });
});
