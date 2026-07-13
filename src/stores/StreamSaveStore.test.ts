import {describe, it, expect, vi} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val: unknown) => val
}));

vi.mock("@/stores", () => ({}));

import StreamSaveStore, {type SavablePanelId} from "@/stores/StreamSaveStore";

// StreamSaveStore is a plain registry/orchestrator with no I/O of its own —
// a bare, empty root store stub is enough for every describe block below.
const makeRootStore = () => ({} as any);

const makePanel = (overrides: Partial<{Save: () => Promise<void>, Discard: () => void}> = {}) => ({
  Save: vi.fn().mockResolvedValue(undefined),
  Discard: vi.fn(),
  ...overrides
});

describe("Register / Unregister", () => {
  const makeRegisterStore = () => {
    const store = new StreamSaveStore(makeRootStore()) as any;
    const general = makePanel();
    return {store, general};
  };

  it("should let SaveAll invoke a registered panel's Save callback once dirty", async () => {
    const {store, general} = makeRegisterStore();
    store.Register({id: "general", Save: general.Save, Discard: general.Discard});
    store.SetDirty({id: "general", isDirty: true});

    await store.SaveAll();

    expect(general.Save).toHaveBeenCalledTimes(1);
  });

  it("should remove the panel and clear its dirty flag when Unregister is called", async () => {
    const {store, general} = makeRegisterStore();
    store.Register({id: "general", Save: general.Save, Discard: general.Discard});
    store.SetDirty({id: "general", isDirty: true});

    store.Unregister("general");

    expect(store.IsDirty("general")).toBe(false);
    expect(store.dirtyPanelIds).not.toContain("general");
  });

  it("should not invoke Save for an unregistered panel even if later marked dirty", async () => {
    const {store, general} = makeRegisterStore();
    store.Register({id: "general", Save: general.Save, Discard: general.Discard});
    store.Unregister("general");
    store.SetDirty({id: "general", isDirty: true});

    await store.SaveAll();

    expect(general.Save).not.toHaveBeenCalled();
  });
});

describe("IsDirty", () => {
  const makeIsDirtyStore = () => new StreamSaveStore(makeRootStore()) as any;

  it("should default to false for a panel id that was never marked dirty", () => {
    const store = makeIsDirtyStore();
    expect(store.IsDirty("recording")).toBe(false);
  });

  it("should return true after SetDirty marks the panel dirty", () => {
    const store = makeIsDirtyStore();
    store.SetDirty({id: "recording", isDirty: true});
    expect(store.IsDirty("recording")).toBe(true);
  });

  it("should return false again after SetDirty marks the panel clean", () => {
    const store = makeIsDirtyStore();
    store.SetDirty({id: "recording", isDirty: true});
    store.SetDirty({id: "recording", isDirty: false});
    expect(store.IsDirty("recording")).toBe(false);
  });
});

describe("SetDirty", () => {
  const makeSetDirtyStore = () => new StreamSaveStore(makeRootStore()) as any;

  it("should set anyDirty to true when any panel becomes dirty", () => {
    const store = makeSetDirtyStore();
    expect(store.anyDirty).toBe(false);

    store.SetDirty({id: "playout", isDirty: true});

    expect(store.anyDirty).toBe(true);
  });

  it("should set anyDirty back to false once every panel is clean again", () => {
    const store = makeSetDirtyStore();
    store.SetDirty({id: "general", isDirty: true});
    store.SetDirty({id: "playout", isDirty: true});

    store.SetDirty({id: "general", isDirty: false});
    store.SetDirty({id: "playout", isDirty: false});

    expect(store.anyDirty).toBe(false);
  });

  it("should list only dirty panel ids in dirtyPanelIds, ordered general/recording/playout", () => {
    const store = makeSetDirtyStore();
    // Mark dirty out of PANEL_ORDER to prove dirtyPanelIds isn't call-order dependent.
    store.SetDirty({id: "playout", isDirty: true});
    store.SetDirty({id: "general", isDirty: true});

    expect(store.dirtyPanelIds).toEqual(["general", "playout"]);
  });

  it("should not include a panel in dirtyPanelIds once it is set clean", () => {
    const store = makeSetDirtyStore();
    store.SetDirty({id: "recording", isDirty: true});
    store.SetDirty({id: "recording", isDirty: false});

    expect(store.dirtyPanelIds).toEqual([]);
  });
});

describe("SaveAll", () => {
  const makeSaveAllStore = (panelIds: SavablePanelId[] = ["general", "recording", "playout"]) => {
    const store = new StreamSaveStore(makeRootStore()) as any;
    const panels: Record<string, ReturnType<typeof makePanel>> = {};

    panelIds.forEach(id => {
      const panel = makePanel();
      panels[id] = panel;
      store.Register({id, Save: panel.Save, Discard: panel.Discard});
    });

    return {store, panels};
  };

  it("should only call Save on panels that are dirty", async () => {
    const {store, panels} = makeSaveAllStore();
    store.SetDirty({id: "recording", isDirty: true});

    await store.SaveAll();

    expect(panels.recording.Save).toHaveBeenCalledTimes(1);
    expect(panels.general.Save).not.toHaveBeenCalled();
    expect(panels.playout.Save).not.toHaveBeenCalled();
  });

  it("should call dirty panels' Save in general/recording/playout order", async () => {
    const {store, panels} = makeSaveAllStore();
    const callOrder: string[] = [];
    panels.playout.Save.mockImplementation(async () => { callOrder.push("playout"); });
    panels.recording.Save.mockImplementation(async () => { callOrder.push("recording"); });

    // Mark dirty in reverse order — SaveAll must still save in PANEL_ORDER.
    store.SetDirty({id: "playout", isDirty: true});
    store.SetDirty({id: "recording", isDirty: true});

    await store.SaveAll();

    expect(callOrder).toEqual(["recording", "playout"]);
  });

  it("should clear the dirty flag for each panel as it succeeds", async () => {
    const {store} = makeSaveAllStore();
    store.SetDirty({id: "general", isDirty: true});

    await store.SaveAll();

    expect(store.IsDirty("general")).toBe(false);
  });

  it("should not clear an already-succeeded panel's dirty flag until the whole batch finishes", async () => {
    // Regression test: dirty flags must clear together at the end of SaveAll,
    // not one at a time as each panel's Save resolves - otherwise indicators
    // flicker off tab-by-tab while the rest of the batch is still saving.
    const {store, panels} = makeSaveAllStore();
    let generalStillDirtyWhenRecordingSaves = false;
    let recordingResolve: () => void;
    const recordingSavePromise = new Promise<void>(resolve => { recordingResolve = resolve; });

    panels.recording.Save.mockImplementation(async () => {
      generalStillDirtyWhenRecordingSaves = store.IsDirty("general");
      await recordingSavePromise;
    });

    store.SetDirty({id: "general", isDirty: true});
    store.SetDirty({id: "recording", isDirty: true});

    const saveAllPromise = store.SaveAll();
    // Let general's Save resolve and the loop advance into recording's Save.
    await Promise.resolve();
    await Promise.resolve();
    recordingResolve();
    await saveAllPromise;

    expect(generalStillDirtyWhenRecordingSaves).toBe(true);
    expect(store.IsDirty("general")).toBe(false);
    expect(store.IsDirty("recording")).toBe(false);
  });

  it("should set saving=true while SaveAll is in flight", async () => {
    const {store, panels} = makeSaveAllStore();
    let sawSavingDuringSave = false;
    panels.general.Save.mockImplementation(async () => {
      sawSavingDuringSave = store.saving;
    });
    store.SetDirty({id: "general", isDirty: true});

    await store.SaveAll();

    expect(sawSavingDuringSave).toBe(true);
    expect(store.saving).toBe(false);
  });

  it("should skip a dirty panel id that has no registered handler", async () => {
    const store = new StreamSaveStore(makeRootStore()) as any;
    store.SetDirty({id: "general", isDirty: true});

    await expect(store.SaveAll()).resolves.toBeUndefined();
  });

  it("should stop at the first panel whose Save rejects and record its id in failedPanelId", async () => {
    const {store, panels} = makeSaveAllStore();
    const saveError = new Error("Recording save failed");
    panels.recording.Save.mockRejectedValue(saveError);
    store.SetDirty({id: "general", isDirty: true});
    store.SetDirty({id: "recording", isDirty: true});
    store.SetDirty({id: "playout", isDirty: true});

    await expect(store.SaveAll()).rejects.toThrow("Recording save failed");

    expect(store.failedPanelId).toBe("recording");
  });

  it("should leave panels already saved in the batch clean after a later panel fails", async () => {
    const {store, panels} = makeSaveAllStore();
    panels.recording.Save.mockRejectedValue(new Error("boom"));
    store.SetDirty({id: "general", isDirty: true});
    store.SetDirty({id: "recording", isDirty: true});
    store.SetDirty({id: "playout", isDirty: true});

    await expect(store.SaveAll()).rejects.toThrow();

    expect(store.IsDirty("general")).toBe(false);
  });

  it("should leave the failed panel and any not-yet-attempted panels dirty", async () => {
    const {store, panels} = makeSaveAllStore();
    panels.recording.Save.mockRejectedValue(new Error("boom"));
    store.SetDirty({id: "general", isDirty: true});
    store.SetDirty({id: "recording", isDirty: true});
    store.SetDirty({id: "playout", isDirty: true});

    await expect(store.SaveAll()).rejects.toThrow();

    expect(store.IsDirty("recording")).toBe(true);
    expect(store.IsDirty("playout")).toBe(true);
    expect(panels.playout.Save).not.toHaveBeenCalled();
  });

  it("should reset saving to false even when a panel's Save rejects", async () => {
    const {store, panels} = makeSaveAllStore();
    panels.general.Save.mockRejectedValue(new Error("boom"));
    store.SetDirty({id: "general", isDirty: true});

    await expect(store.SaveAll()).rejects.toThrow();

    expect(store.saving).toBe(false);
  });

  it("should clear a stale failedPanelId from a previous run at the start of a new SaveAll", async () => {
    const {store, panels} = makeSaveAllStore();
    panels.general.Save.mockRejectedValueOnce(new Error("first failure"));
    store.SetDirty({id: "general", isDirty: true});
    await expect(store.SaveAll()).rejects.toThrow("first failure");
    expect(store.failedPanelId).toBe("general");

    // Retry: this time Save succeeds, so failedPanelId should clear.
    store.SetDirty({id: "general", isDirty: true});
    await store.SaveAll();

    expect(store.failedPanelId).toBeNull();
  });
});

describe("DiscardAll", () => {
  const makeDiscardAllStore = (panelIds: SavablePanelId[] = ["general", "recording", "playout"]) => {
    const store = new StreamSaveStore(makeRootStore()) as any;
    const panels: Record<string, ReturnType<typeof makePanel>> = {};

    panelIds.forEach(id => {
      const panel = makePanel();
      panels[id] = panel;
      store.Register({id, Save: panel.Save, Discard: panel.Discard});
    });

    return {store, panels};
  };

  it("should call Discard on every dirty panel", () => {
    const {store, panels} = makeDiscardAllStore();
    store.SetDirty({id: "general", isDirty: true});
    store.SetDirty({id: "playout", isDirty: true});

    store.DiscardAll();

    expect(panels.general.Discard).toHaveBeenCalledTimes(1);
    expect(panels.playout.Discard).toHaveBeenCalledTimes(1);
  });

  it("should not call Discard on panels that are not dirty", () => {
    const {store, panels} = makeDiscardAllStore();
    store.SetDirty({id: "general", isDirty: true});

    store.DiscardAll();

    expect(panels.recording.Discard).not.toHaveBeenCalled();
    expect(panels.playout.Discard).not.toHaveBeenCalled();
  });

  it("should clear the dirty flag on every panel that was discarded", () => {
    const {store} = makeDiscardAllStore();
    store.SetDirty({id: "general", isDirty: true});
    store.SetDirty({id: "recording", isDirty: true});

    store.DiscardAll();

    expect(store.anyDirty).toBe(false);
    expect(store.dirtyPanelIds).toEqual([]);
  });

  it("should not throw when a dirty panel id has no registered handler", () => {
    const store = new StreamSaveStore(makeRootStore()) as any;
    store.SetDirty({id: "general", isDirty: true});

    expect(() => store.DiscardAll()).not.toThrow();
    expect(store.IsDirty("general")).toBe(false);
  });
});

describe("Reset", () => {
  const makeResetStore = () => {
    const store = new StreamSaveStore(makeRootStore()) as any;
    const general = makePanel();
    store.Register({id: "general", Save: general.Save, Discard: general.Discard});
    return {store, general};
  };

  it("should clear all dirty flags", () => {
    const {store} = makeResetStore();
    store.SetDirty({id: "general", isDirty: true});

    store.Reset();

    expect(store.anyDirty).toBe(false);
    expect(store.dirtyPanelIds).toEqual([]);
  });

  it("should unregister all panels so a later SaveAll has nothing to invoke", async () => {
    const {store, general} = makeResetStore();
    store.SetDirty({id: "general", isDirty: true});

    store.Reset();
    // Re-mark dirty post-reset to prove the panel registration itself is gone,
    // not just the dirty flag.
    store.SetDirty({id: "general", isDirty: true});
    await store.SaveAll();

    expect(general.Save).not.toHaveBeenCalled();
  });

  it("should clear failedPanelId", async () => {
    const {store, general} = makeResetStore();
    general.Save.mockRejectedValue(new Error("boom"));
    store.SetDirty({id: "general", isDirty: true});
    await expect(store.SaveAll()).rejects.toThrow();
    expect(store.failedPanelId).toBe("general");

    store.Reset();

    expect(store.failedPanelId).toBeNull();
  });

  it("should reset saving to false", () => {
    const {store} = makeResetStore();
    store.saving = true;

    store.Reset();

    expect(store.saving).toBe(false);
  });
});
