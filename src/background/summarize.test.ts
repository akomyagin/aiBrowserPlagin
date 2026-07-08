import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TEXT_CHARS,
  callLLM,
  httpErrorMessage,
  truncateText,
} from "./summarize.ts";
import type { Settings } from "../lib/settings.ts";

const validSettings: Settings = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test-123",
  model: "gpt-4o-mini",
};

function okResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

function errResponse(status: number, statusText = ""): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  } as unknown as Response;
}

const neverAbort = new AbortController().signal;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("truncateText", () => {
  it("returns short text unchanged", () => {
    expect(truncateText("hello world")).toBe("hello world");
  });

  it("truncates text longer than MAX_TEXT_CHARS with a marker", () => {
    const long = "a".repeat(MAX_TEXT_CHARS + 1000);
    const result = truncateText(long);
    expect(result.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    expect(result).toContain("[...content truncated...]");
  });

  it("returns text unchanged when length equals MAX_TEXT_CHARS exactly", () => {
    const exact = "x".repeat(MAX_TEXT_CHARS);
    expect(truncateText(exact)).toBe(exact);
  });
});

describe("httpErrorMessage", () => {
  it("401 mentions API key", () => {
    expect(httpErrorMessage(401, "Unauthorized")).toContain("API key");
  });
  it("429 mentions Rate limit", () => {
    expect(httpErrorMessage(429, "Too Many Requests")).toContain("Rate limit");
  });
  it("500 mentions service error", () => {
    expect(httpErrorMessage(500, "Server Error")).toContain("service error");
  });
  it("502 mentions service error", () => {
    expect(httpErrorMessage(502, "Bad Gateway")).toContain("service error");
  });
  it("503 mentions service error", () => {
    expect(httpErrorMessage(503, "Service Unavailable")).toContain("service error");
  });
  it("504 mentions service error", () => {
    expect(httpErrorMessage(504, "Gateway Timeout")).toContain("service error");
  });
  it("522 mentions service error", () => {
    expect(httpErrorMessage(522, "Connection Timed Out")).toContain("service error");
  });
  it("403 mentions Access forbidden", () => {
    expect(httpErrorMessage(403, "Forbidden")).toContain("Access forbidden");
  });
  it("unknown status returns generic HTTP message", () => {
    expect(httpErrorMessage(418, "I'm a Teapot")).toContain("HTTP 418");
  });
});

describe("callLLM", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      callLLM("text", undefined, undefined, { ...validSettings, apiKey: "" }, neverAbort),
    ).rejects.toThrow("API key not configured");
  });

  it("calls fetch with the correct URL and headers", async () => {
    const fetchMock = vi.mocked(globalThis.fetch).mockResolvedValue(
      okResponse("summary"),
    );
    await callLLM("body text", "https://x.test", "Title", validSettings, neverAbort);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test-123");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("parses choices[0].message.content from a successful response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      okResponse("• point one\n• point two"),
    );
    const result = await callLLM(
      "text",
      undefined,
      undefined,
      validSettings,
      neverAbort,
    );
    expect(result).toBe("• point one\n• point two");
  });

  it("throws a Rate limit error on 429", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      errResponse(429, "Too Many Requests"),
    );
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("Rate limit");
  });

  it("throws a timeout error on AbortError (DOMException)", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    );
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("timed out");
  });

  it("throws a timeout error on AbortError (plain Error)", async () => {
    const plainAbort = Object.assign(new Error("Aborted"), { name: "AbortError" });
    vi.mocked(globalThis.fetch).mockRejectedValue(plainAbort);
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("timed out");
  });

  it("throws a network error on 'Failed to fetch'", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(
      new Error("Failed to fetch"),
    );
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("Network error");
  });

  it("re-throws unknown fetch errors as-is", async () => {
    const unknown = new Error("some unknown error");
    vi.mocked(globalThis.fetch).mockRejectedValue(unknown);
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("some unknown error");
  });

  it("throws on unexpected API response format (content not a string)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ choices: [{ message: { content: 42 } }] }),
    } as unknown as Response);
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("Unexpected API response format");
  });

  it("throws on empty string response from LLM", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(""));
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("Unexpected API response format");
  });

  it("throws on whitespace-only response from LLM", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse("   \n  "));
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("Unexpected API response format");
  });

  it("throws on unexpected API response format (choices missing)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
    } as unknown as Response);
    await expect(
      callLLM("text", undefined, undefined, validSettings, neverAbort),
    ).rejects.toThrow("Unexpected API response format");
  });
});
