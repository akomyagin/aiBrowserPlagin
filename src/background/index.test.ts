// Integration-ish test for the background service worker's message listener.
//
// index.ts registers listeners at module top level against the `chrome` global,
// so we stub a minimal chrome shim BEFORE importing it, capture the registered
// onMessage listener, and drive it directly. The focus is the Stage 3 CANCEL
// path: CANCEL_SUMMARIZE must abort the in-flight request's AbortSignal.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CancelRequest,
  ExtractRequest,
  SummarizeRequest,
} from "../lib/messages.ts";

type OnMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

let onInstalledListener: () => void;
let onMessageListener: OnMessageListener;
// Widened to the fields the tests assert on; the full stub has more.
let sidePanelStub: { setPanelBehavior: ReturnType<typeof vi.fn> };

// Deferred: capture the AbortSignal handed to fetch and never resolve, so the
// request stays "in flight" and cancellation is observable.
let capturedSignal: AbortSignal | undefined;

beforeEach(async () => {
  capturedSignal = undefined;
  vi.resetModules();

  const chromeStub = {
    runtime: {
      onInstalled: {
        addListener: vi.fn((listener: () => void) => {
          onInstalledListener = listener;
        }),
      },
      onMessage: {
        addListener: vi.fn((listener: OnMessageListener) => {
          onMessageListener = listener;
        }),
      },
    },
    contextMenus: {
      create: vi.fn(),
      onClicked: { addListener: vi.fn() },
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async () => undefined),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
  };
  sidePanelStub = chromeStub.sidePanel;
  vi.stubGlobal("chrome", chromeStub);

  // A key must be present so callLLM proceeds to fetch; loadSettings falls back
  // to defaults, so stub storage to return a configured key.
  chromeStub.storage.local.get = vi.fn(async () => ({
    settings: {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    },
  }));

  globalThis.fetch = vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        capturedSignal = init?.signal ?? undefined;
        // Reject when aborted, mimicking a real fetch reacting to the signal.
        capturedSignal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  ) as unknown as typeof fetch;

  await import("./index.ts");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("background onMessage", () => {
  it("registers a listener", () => {
    expect(typeof onMessageListener).toBe("function");
  });

  it("CANCEL_SUMMARIZE aborts the in-flight request signal", async () => {
    const summarize: SummarizeRequest = {
      type: "SUMMARIZE",
      source: "page",
      text: "hello",
    };
    const kept = onMessageListener(summarize, {}, () => undefined);
    expect(kept).toBe(true); // async handler keeps the channel open

    // Let the async summarize reach fetch and store the controller.
    await vi.waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal?.aborted).toBe(false);

    const cancel: CancelRequest = { type: "CANCEL_SUMMARIZE" };
    const ret = onMessageListener(cancel, {}, () => undefined);
    expect(ret).toBeUndefined(); // synchronous handler
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("CANCEL_SUMMARIZE with no in-flight request is a no-op", () => {
    const cancel: CancelRequest = { type: "CANCEL_SUMMARIZE" };
    expect(() =>
      onMessageListener(cancel, {}, () => undefined),
    ).not.toThrow();
  });

  it("SUMMARIZE sends SummarizeResult with ok:true on success", async () => {
    // Override fetch to resolve immediately with a valid JSON response.
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Summary text" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const req: SummarizeRequest = {
      type: "SUMMARIZE",
      source: "page",
      text: "Some page text",
      url: "https://example.com",
      title: "Example",
    };
    const responses: unknown[] = [];
    const kept = onMessageListener(req, {}, (r) => responses.push(r));
    expect(kept).toBe(true);

    await vi.waitFor(() => expect(responses).toHaveLength(1));
    const result = responses[0] as { type: string; ok: boolean };
    expect(result.type).toBe("SUMMARIZE_RESULT");
    expect(result.ok).toBe(true);
  });

  it("SUMMARIZE sends SummarizeResult with ok:false on fetch error", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network failure");
    }) as unknown as typeof fetch;

    const req: SummarizeRequest = {
      type: "SUMMARIZE",
      source: "page",
      text: "Some text",
    };
    const responses: unknown[] = [];
    onMessageListener(req, {}, (r) => responses.push(r));

    await vi.waitFor(() => expect(responses).toHaveLength(1));
    const result = responses[0] as { type: string; ok: boolean; error: string };
    expect(result.type).toBe("SUMMARIZE_RESULT");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network failure");
  });

  it("unknown message type returns undefined (no-op)", () => {
    // ExtractRequest is routed by content script, not handled in background.
    const extract: ExtractRequest = { type: "EXTRACT", source: "page" };
    const ret = onMessageListener(extract, {}, () => undefined);
    expect(ret).toBeUndefined();
  });

  it("onInstalled listener fires without throwing", () => {
    expect(() => onInstalledListener()).not.toThrow();
  });

  it("onInstalled sets the side panel behavior to not open on action click", () => {
    onInstalledListener();
    expect(sidePanelStub.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    });
  });
});
