import {describe, it, expect, vi} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val: unknown) => val
}));

vi.mock("@/stores", () => ({}));

import OutputSaveStore from "@/stores/OutputSaveStore";

// OutputSaveStore is a plain registry/orchestrator with no I/O of its own —
// a bare, empty root store stub is enough for every describe block below.
const makeRootStore = () => ({} as any);

const makePanel = (overrides: Partial<{Save: () => Promise<void>, Discard: () => void}> = {}) => ({
  Save: vi.fn().mockResolvedValue(undefined),
  Discard: vi.fn(),
  ...overrides
});

describe("Register / Unregister", () => {
  const makeRegisterStore = () => {
    const store = new OutputSaveStore(makeRootStore()) as any;
    const generalConfig = makePanel();
    return {store, generalConfig};
  };

  it("should let SaveAll invoke a registered panel's Save callback once dirty", async () => {
    const {store, generalConfig} = makeRegisterStore();
    store.Register({id: "generalConfig", Save: generalConfig.Save, Discard: generalConfig.Discard});
    store.SetDirty({id: "generalConfig", isDirty: true});

    await store.SaveAll();

    expect(generalConfig.Save).toHaveBeenCalledTimes(1);
  });

  it("should remove the panel and clear its dirty flag when Unregister is called", async () => {
    const {store, generalConfig} = makeRegisterStore();
    store.Register({id: "generalConfig", Save: generalConfig.Save, Discard: generalConfig.Discard});
    store.SetDirty({id: "generalConfig", isDirty: true});

    store.Unregister("generalConfig");

    expect(store.IsDirty("generalConfig")).toBe(false);
    expect(store.dirtyPanelIds).not.toContain("generalConfig");
  });

  it("should not invoke Save for an unregistered panel even if later marked dirty", async () => {
    const {store, generalConfig} = makeRegisterStore();
    store.Register({id: "generalConfig", Save: generalConfig.Save, Discard: generalConfig.Discard});
    store.Unregister("generalConfig");
    store.SetDirty({id: "generalConfig", isDirty: true});

    await store.SaveAll();

    expect(generalConfig.Save).not.toHaveBeenCalled();
  });
});

describe("IsDirty", () => {
  const makeIsDirtyStore = () => new OutputSaveStore(makeRootStore()) as any;

  it("should default to false for a panel id that was never marked dirty", () => {
    const store = makeIsDirtyStore();
    expect(store.IsDirty("generalConfig")).toBe(false);
  });

  it("should return true after SetDirty marks the panel dirty", () => {
    const store = makeIsDirtyStore();
    store.SetDirty({id: "generalConfig", isDirty: true});
    expect(store.IsDirty("generalConfig")).toBe(true);
  });

  it("should return false again after SetDirty marks the panel clean", () => {
    const store = makeIsDirtyStore();
    store.SetDirty({id: "generalConfig", isDirty: true});
    store.SetDirty({id: "generalConfig", isDirty: false});
    expect(store.IsDirty("generalConfig")).toBe(false);
  });
});

describe("SetDirty", () => {
  const makeSetDirtyStore = () => new OutputSaveStore(makeRootStore()) as any;

  it("should set anyDirty to true when the panel becomes dirty", () => {
    const store = makeSetDirtyStore();
    expect(store.anyDirty).toBe(false);

    store.SetDirty({id: "generalConfig", isDirty: true});

    expect(store.anyDirty).toBe(true);
  });

  it("should set anyDirty back to false once the panel is clean again", () => {
    const store = makeSetDirtyStore();
    store.SetDirty({id: "generalConfig", isDirty: true});

    store.SetDirty({id: "generalConfig", isDirty: false});

    expect(store.anyDirty).toBe(false);
  });

  it("should list the panel id in dirtyPanelIds only while dirty", () => {
    const store = makeSetDirtyStore();
    store.SetDirty({id: "generalConfig", isDirty: true});
    expect(store.dirtyPanelIds).toEqual(["generalConfig"]);

    store.SetDirty({id: "generalConfig", isDirty: false});
    expect(store.dirtyPanelIds).toEqual([]);
  });
});

describe("SaveAll", () => {
  const makeSaveAllStore = () => {
    const store = new OutputSaveStore(makeRootStore()) as any;
    const generalConfig = makePanel();
    store.Register({id: "generalConfig", Save: generalConfig.Save, Discard: generalConfig.Discard});
    return {store, generalConfig};
  };

  it("should not call Save when the panel is not dirty", async () => {
    const {store, generalConfig} = makeSaveAllStore();

    await store.SaveAll();

    expect(generalConfig.Save).not.toHaveBeenCalled();
  });

  it("should clear the dirty flag once Save succeeds", async () => {
    const {store} = makeSaveAllStore();
    store.SetDirty({id: "generalConfig", isDirty: true});

    await store.SaveAll();

    expect(store.IsDirty("generalConfig")).toBe(false);
  });

  it("should set saving=true while SaveAll is in flight", async () => {
    const {store, generalConfig} = makeSaveAllStore();
    let sawSavingDuringSave = false;
    generalConfig.Save.mockImplementation(async () => {
      sawSavingDuringSave = store.saving;
    });
    store.SetDirty({id: "generalConfig", isDirty: true});

    await store.SaveAll();

    expect(sawSavingDuringSave).toBe(true);
    expect(store.saving).toBe(false);
  });

  it("should skip a dirty panel id that has no registered handler", async () => {
    const store = new OutputSaveStore(makeRootStore()) as any;
    store.SetDirty({id: "generalConfig", isDirty: true});

    await expect(store.SaveAll()).resolves.toBeUndefined();
  });

  it("should record the panel id in failedPanelId when its Save rejects", async () => {
    const {store, generalConfig} = makeSaveAllStore();
    generalConfig.Save.mockRejectedValue(new Error("Save failed"));
    store.SetDirty({id: "generalConfig", isDirty: true});

    await expect(store.SaveAll()).rejects.toThrow("Save failed");

    expect(store.failedPanelId).toBe("generalConfig");
  });

  it("should leave the panel dirty after its Save rejects", async () => {
    const {store, generalConfig} = makeSaveAllStore();
    generalConfig.Save.mockRejectedValue(new Error("boom"));
    store.SetDirty({id: "generalConfig", isDirty: true});

    await expect(store.SaveAll()).rejects.toThrow();

    expect(store.IsDirty("generalConfig")).toBe(true);
  });

  it("should reset saving to false even when Save rejects", async () => {
    const {store, generalConfig} = makeSaveAllStore();
    generalConfig.Save.mockRejectedValue(new Error("boom"));
    store.SetDirty({id: "generalConfig", isDirty: true});

    await expect(store.SaveAll()).rejects.toThrow();

    expect(store.saving).toBe(false);
  });

  it("should clear a stale failedPanelId from a previous run at the start of a new SaveAll", async () => {
    const {store, generalConfig} = makeSaveAllStore();
    generalConfig.Save.mockRejectedValueOnce(new Error("first failure"));
    store.SetDirty({id: "generalConfig", isDirty: true});
    await expect(store.SaveAll()).rejects.toThrow("first failure");
    expect(store.failedPanelId).toBe("generalConfig");

    store.SetDirty({id: "generalConfig", isDirty: true});
    await store.SaveAll();

    expect(store.failedPanelId).toBeNull();
  });
});

describe("DiscardAll", () => {
  const makeDiscardAllStore = () => {
    const store = new OutputSaveStore(makeRootStore()) as any;
    const generalConfig = makePanel();
    store.Register({id: "generalConfig", Save: generalConfig.Save, Discard: generalConfig.Discard});
    return {store, generalConfig};
  };

  it("should call Discard on the panel when dirty", () => {
    const {store, generalConfig} = makeDiscardAllStore();
    store.SetDirty({id: "generalConfig", isDirty: true});

    store.DiscardAll();

    expect(generalConfig.Discard).toHaveBeenCalledTimes(1);
  });

  it("should not call Discard when the panel is not dirty", () => {
    const {store, generalConfig} = makeDiscardAllStore();

    store.DiscardAll();

    expect(generalConfig.Discard).not.toHaveBeenCalled();
  });

  it("should clear the dirty flag on the discarded panel", () => {
    const {store} = makeDiscardAllStore();
    store.SetDirty({id: "generalConfig", isDirty: true});

    store.DiscardAll();

    expect(store.anyDirty).toBe(false);
    expect(store.dirtyPanelIds).toEqual([]);
  });

  it("should not throw when a dirty panel id has no registered handler", () => {
    const store = new OutputSaveStore(makeRootStore()) as any;
    store.SetDirty({id: "generalConfig", isDirty: true});

    expect(() => store.DiscardAll()).not.toThrow();
    expect(store.IsDirty("generalConfig")).toBe(false);
  });
});

describe("Reset", () => {
  const makeResetStore = () => {
    const store = new OutputSaveStore(makeRootStore()) as any;
    const generalConfig = makePanel();
    store.Register({id: "generalConfig", Save: generalConfig.Save, Discard: generalConfig.Discard});
    return {store, generalConfig};
  };

  it("should clear all dirty flags", () => {
    const {store} = makeResetStore();
    store.SetDirty({id: "generalConfig", isDirty: true});

    store.Reset();

    expect(store.anyDirty).toBe(false);
    expect(store.dirtyPanelIds).toEqual([]);
  });

  it("should unregister all panels so a later SaveAll has nothing to invoke", async () => {
    const {store, generalConfig} = makeResetStore();
    store.SetDirty({id: "generalConfig", isDirty: true});

    store.Reset();
    store.SetDirty({id: "generalConfig", isDirty: true});
    await store.SaveAll();

    expect(generalConfig.Save).not.toHaveBeenCalled();
  });

  it("should clear failedPanelId", async () => {
    const {store, generalConfig} = makeResetStore();
    generalConfig.Save.mockRejectedValue(new Error("boom"));
    store.SetDirty({id: "generalConfig", isDirty: true});
    await expect(store.SaveAll()).rejects.toThrow();
    expect(store.failedPanelId).toBe("generalConfig");

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
