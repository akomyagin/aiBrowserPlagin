import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings.ts";

const store: Record<string, unknown> = {};
const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      }),
    },
  },
};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.clearAllMocks();
  vi.stubGlobal("chrome", chromeMock);
});

describe("loadSettings", () => {
  it("returns DEFAULT_SETTINGS on empty storage", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial stored data over defaults", async () => {
    store.settings = { apiKey: "sk-partial" };
    const s = await loadSettings();
    expect(s).toEqual({ ...DEFAULT_SETTINGS, apiKey: "sk-partial" });
  });
});

describe("saveSettings", () => {
  it("round-trips through loadSettings", async () => {
    const input: Settings = {
      baseUrl: "https://example.com/v1",
      apiKey: "sk-roundtrip",
      model: "gpt-4o",
    };
    await saveSettings(input);
    expect(await loadSettings()).toEqual(input);
  });

  it("persists a full object correctly", async () => {
    const input: Settings = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-full",
      model: "gpt-4o-mini",
    };
    await saveSettings(input);
    expect(store.settings).toEqual(input);
  });
});
