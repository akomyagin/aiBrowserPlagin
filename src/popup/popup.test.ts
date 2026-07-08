// Tests for the Stage 5 selection flow in the popup's init().
//
// popup.ts reads DOM elements and runs init() at module top level, so we build
// the required DOM and stub `chrome` BEFORE importing it. loadSettings is mocked
// to return a configured API key so the summarize flow is reachable.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SummarizeResult } from "../lib/messages.ts";

const loadSettingsMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/settings.ts", () => ({
  loadSettings: loadSettingsMock,
  saveSettings: vi.fn(async () => undefined),
}));

const DOM = `
  <div id="main-view">
    <button id="summarize"></button>
    <button id="cancel" hidden></button>
    <button id="settings-toggle"></button>
    <div id="status"></div>
    <div id="summary"></div>
  </div>
  <div id="settings-view" hidden>
    <input id="s-base-url" />
    <input id="s-api-key" />
    <input id="s-model" />
    <button id="s-save"></button>
    <button id="s-back"></button>
    <div id="s-status"></div>
  </div>
`;

let sessionGetSpy: ReturnType<typeof vi.fn>;
let sessionRemoveSpy: ReturnType<typeof vi.fn>;
let runtimeSendSpy: ReturnType<typeof vi.fn>;

function setupChrome(pendingSelection?: {
  text: string;
  url: string;
  title: string;
}): void {
  sessionGetSpy = vi.fn(async () =>
    pendingSelection ? { pendingSelection } : {},
  );
  sessionRemoveSpy = vi.fn(async () => undefined);
  runtimeSendSpy = vi.fn(
    async (): Promise<SummarizeResult> => ({
      type: "SUMMARIZE_RESULT",
      ok: true,
      summary: "The summary.",
    }),
  );

  vi.stubGlobal("chrome", {
    storage: {
      session: { get: sessionGetSpy, remove: sessionRemoveSpy },
    },
    runtime: { sendMessage: runtimeSendSpy },
    tabs: { query: vi.fn(async () => [{ id: 1 }]) },
  });
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = DOM;
  loadSettingsMock.mockResolvedValue({
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("popup init pendingSelection", () => {
  it("runs the summarize flow when pendingSelection has text", async () => {
    setupChrome({
      text: "highlighted text",
      url: "https://example.com",
      title: "Example",
    });
    await import("./popup.ts");

    await vi.waitFor(() => expect(runtimeSendSpy).toHaveBeenCalled());
    expect(sessionRemoveSpy).toHaveBeenCalledWith("pendingSelection");
    const req = runtimeSendSpy.mock.calls[0][0] as {
      type: string;
      source: string;
      text: string;
    };
    expect(req.type).toBe("SUMMARIZE");
    expect(req.source).toBe("selection");
    expect(req.text).toBe("highlighted text");

    await vi.waitFor(() =>
      expect(document.getElementById("summary")?.textContent).toBe(
        "The summary.",
      ),
    );
  });

  it("shows 'No text selected.' when pendingSelection is empty", async () => {
    setupChrome({ text: "", url: "", title: "" });
    await import("./popup.ts");

    await vi.waitFor(() =>
      expect(sessionRemoveSpy).toHaveBeenCalledWith("pendingSelection"),
    );
    expect(runtimeSendSpy).not.toHaveBeenCalled();
    expect(document.getElementById("summary")?.textContent).toBe(
      "No text selected.",
    );
  });

  it("does nothing special when there is no pendingSelection", async () => {
    setupChrome(undefined);
    await import("./popup.ts");

    await vi.waitFor(() => expect(sessionGetSpy).toHaveBeenCalled());
    expect(sessionRemoveSpy).not.toHaveBeenCalled();
    expect(runtimeSendSpy).not.toHaveBeenCalled();
  });
});
