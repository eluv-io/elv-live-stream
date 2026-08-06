import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn()
}));

import UserSettingsStore from "@/stores/UserSettingsStore";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const makeStore = (walletClientOverrides: Record<string, unknown> = {}) => {
  const mockClient = {
    walletClient: {
      ProfileMetadata: vi.fn().mockResolvedValue(undefined),
      SetProfileMetadata: vi.fn().mockResolvedValue(undefined),
      ...walletClientOverrides
    }
  };

  const mockRootStore = {client: mockClient};

  const store = new UserSettingsStore(mockRootStore as any) as any;

  return {store, mockClient};
};

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

describe("Load", () => {
  it("should default tableFilters to empty arrays when no metadata exists yet", async () => {
    const {store} = makeStore();

    await store.Load();

    expect(store.loaded).toBe(true);
    expect(store.settings.tableFilters).toEqual({streams: [], outputs: []});
  });

  it("should request the tableFilters key from private app metadata", async () => {
    const {store, mockClient} = makeStore();

    await store.Load();

    expect(mockClient.walletClient.ProfileMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "app",
        appId: "live-stream-manager",
        mode: "private",
        key: "tableFilters"
      })
    );
  });

  it("should hydrate settings from an existing ProfileMetadata response", async () => {
    const {store} = makeStore({
      ProfileMetadata: vi.fn().mockResolvedValue({streams: ["sports"], outputs: ["news"]})
    });

    await store.Load();

    expect(store.settings.tableFilters).toEqual({streams: ["sports"], outputs: ["news"]});
  });

  it("should fill missing fields from defaults when the response is partial", async () => {
    const {store} = makeStore({
      ProfileMetadata: vi.fn().mockResolvedValue({streams: ["sports"]})
    });

    await store.Load();

    expect(store.settings.tableFilters).toEqual({streams: ["sports"], outputs: []});
  });

  it("should parse a JSON-string response instead of spreading its characters", async () => {
    const {store} = makeStore({
      ProfileMetadata: vi.fn().mockResolvedValue(JSON.stringify({streams: ["24/7"], outputs: []}))
    });

    await store.Load();

    expect(store.settings.tableFilters).toEqual({streams: ["24/7"], outputs: []});
  });

  it("should discard stray fields left over from a previously corrupted write", async () => {
    const corrupted = {
      "0": "{", "1": "\"", "2": "s", "3": "t", "4": "r",
      streams: ["24/7"],
      outputs: []
    };
    const {store} = makeStore({
      ProfileMetadata: vi.fn().mockResolvedValue(corrupted)
    });

    await store.Load();

    expect(store.settings.tableFilters).toEqual({streams: ["24/7"], outputs: []});
    expect(Object.keys(store.settings.tableFilters)).toEqual(["streams", "outputs"]);
  });

  it("should not carry corrupted fields forward into the next persisted write", async () => {
    const corrupted = {"0": "{", "1": "\"", streams: ["24/7"], outputs: []};
    const {store, mockClient} = makeStore({
      ProfileMetadata: vi.fn().mockResolvedValue(corrupted)
    });
    vi.useFakeTimers();

    await store.Load();
    store.Persist("tableFilters", {streams: ["24/7", "2026"]});
    vi.advanceTimersByTime(800);

    expect(mockClient.walletClient.SetProfileMetadata).toHaveBeenCalledWith(
      expect.objectContaining({value: {streams: ["24/7", "2026"], outputs: []}})
    );

    vi.useRealTimers();
  });

  it("should keep defaults and still mark loaded=true when ProfileMetadata rejects", async () => {
    const {store} = makeStore({
      ProfileMetadata: vi.fn().mockRejectedValue(new Error("network error"))
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await store.Load();

    expect(store.loaded).toBe(true);
    expect(store.settings.tableFilters).toEqual({streams: [], outputs: []});
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

describe("Persist", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should apply the partial update to settings immediately, before the debounce fires", () => {
    const {store} = makeStore();

    store.Persist("tableFilters", {streams: ["sports"]});

    expect(store.settings.tableFilters).toEqual({streams: ["sports"], outputs: []});
  });

  it("should not clobber other fields of the same key when persisting a partial update", () => {
    const {store} = makeStore();
    store.settings = {tableFilters: {streams: [], outputs: ["news"]}};

    store.Persist("tableFilters", {streams: ["sports"]});

    expect(store.settings.tableFilters).toEqual({streams: ["sports"], outputs: ["news"]});
  });

  it("should not write to the fabric before the debounce interval elapses", () => {
    const {store, mockClient} = makeStore();

    store.Persist("tableFilters", {streams: ["sports"]});

    vi.advanceTimersByTime(799);

    expect(mockClient.walletClient.SetProfileMetadata).not.toHaveBeenCalled();
  });

  it("should coalesce rapid successive calls into a single SetProfileMetadata write", () => {
    const {store, mockClient} = makeStore();

    store.Persist("tableFilters", {streams: ["a"]});
    store.Persist("tableFilters", {streams: ["a", "b"]});
    store.Persist("tableFilters", {streams: ["a", "b", "c"]});

    vi.advanceTimersByTime(800);

    expect(mockClient.walletClient.SetProfileMetadata).toHaveBeenCalledTimes(1);
    expect(mockClient.walletClient.SetProfileMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "app",
        appId: "live-stream-manager",
        mode: "private",
        key: "tableFilters",
        value: {streams: ["a", "b", "c"], outputs: []}
      })
    );
  });

  it("should log and not throw when the debounced write rejects", () => {
    const {store, mockClient} = makeStore({
      SetProfileMetadata: vi.fn().mockRejectedValue(new Error("write failed"))
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    store.Persist("tableFilters", {streams: ["sports"]});

    expect(() => vi.advanceTimersByTime(800)).not.toThrow();
    expect(mockClient.walletClient.SetProfileMetadata).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});