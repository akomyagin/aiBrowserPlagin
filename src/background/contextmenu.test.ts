// Tests for the Stage 5 context-menu wiring in the background service worker.
//
// index.ts registers listeners at module top level against the `chrome` global,
// so we stub a minimal chrome shim BEFORE importing it, capture the registered
// onInstalled / contextMenus.onClicked listeners, and drive them directly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractResult } from "../lib/messages.ts";

type OnClickedListener = (
  info: { menuItemId: string | number },
  tab?: { id?: number },
) => void;

let onInstalledListener: () => void;
let onClickedListener: OnClickedListener;

let createSpy: ReturnType<typeof vi.fn>;
let sendMessageSpy: ReturnType<typeof vi.fn>;
let sessionSetSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();

  createSpy = vi.fn();
  sendMessageSpy = vi.fn(
    async (): Promise<ExtractResult> => ({
      type: "EXTRACT_RESULT",
      text: "selected text",
      url: "https://example.com",
      title: "Example",
    }),
  );
  sessionSetSpy = vi.fn(async () => undefined);

  const chromeStub = {
    runtime: {
      onInstalled: {
        addListener: vi.fn((listener: () => void) => {
          onInstalledListener = listener;
        }),
      },
      onMessage: { addListener: vi.fn() },
    },
    contextMenus: {
      create: createSpy,
      onClicked: {
        addListener: vi.fn((listener: OnClickedListener) => {
          onClickedListener = listener;
        }),
      },
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async () => undefined),
    },
    tabs: { sendMessage: sendMessageSpy },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
      session: { set: sessionSetSpy },
    },
  };
  vi.stubGlobal("chrome", chromeStub);

  await import("./index.ts");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("background context menu", () => {
  it("onInstalled creates the summarize-selection menu item", () => {
    onInstalledListener();
    expect(createSpy).toHaveBeenCalledWith({
      id: "summarize-selection",
      title: "Summarize selection",
      contexts: ["selection"],
    });
  });

  it("onClicked on the menu item extracts selection and stores it", async () => {
    onClickedListener({ menuItemId: "summarize-selection" }, { id: 42 });
    await vi.waitFor(() => expect(sessionSetSpy).toHaveBeenCalled());

    expect(sendMessageSpy).toHaveBeenCalledWith(42, {
      type: "EXTRACT",
      source: "selection",
    });
    expect(sessionSetSpy).toHaveBeenCalledWith({
      pendingSelection: {
        text: "selected text",
        url: "https://example.com",
        title: "Example",
      },
    });
  });

  it("onClicked with a different menuItemId is a no-op", () => {
    onClickedListener({ menuItemId: "other" }, { id: 42 });
    expect(sendMessageSpy).not.toHaveBeenCalled();
    expect(sessionSetSpy).not.toHaveBeenCalled();
  });

  it("onClicked with no tab.id is a no-op", () => {
    onClickedListener({ menuItemId: "summarize-selection" }, {});
    expect(sendMessageSpy).not.toHaveBeenCalled();
    expect(sessionSetSpy).not.toHaveBeenCalled();
  });

  it("onClicked stores an empty selection when the content script is unreachable", async () => {
    sendMessageSpy.mockRejectedValueOnce(
      new Error("Receiving end does not exist"),
    );
    onClickedListener({ menuItemId: "summarize-selection" }, { id: 7 });
    await vi.waitFor(() => expect(sessionSetSpy).toHaveBeenCalled());
    expect(sessionSetSpy).toHaveBeenCalledWith({
      pendingSelection: { text: "", url: "", title: "" },
    });
  });
});
