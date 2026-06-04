import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
}));

vi.mock("@/stores", () => ({}));

import OutputModalStore from "./OutputModalStore";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const makeOutputStore = (outputs: Record<string, {name: string; input?: {stream?: string}}> = {}) => ({
  outputs,
  UnmapStreamBatch: vi.fn().mockResolvedValue(undefined),
  ResetOutput: vi.fn().mockResolvedValue(undefined),
  EnableOutput: vi.fn().mockResolvedValue(undefined),
  EnableOutputBatch: vi.fn().mockResolvedValue(undefined),
  DisableOutput: vi.fn().mockResolvedValue(undefined),
  DisableOutputBatch: vi.fn().mockResolvedValue(undefined),
  DeleteOutput: vi.fn().mockResolvedValue(undefined),
  DeleteOutputBatch: vi.fn().mockResolvedValue(undefined),
});

const makeStore = (outputs = {}) => {
  const outputStore = makeOutputStore(outputs);
  const mockRootStore = {outputStore};
  const store = new OutputModalStore(mockRootStore as any);
  return {store, outputStore};
};

// ---------------------------------------------------------------------------
// isConfirmModalOpen / confirmConfig / outputName computed getters
// ---------------------------------------------------------------------------

describe("isConfirmModalOpen", () => {
  it("should return true when activeModal is a known action key", () => {
    const {store} = makeStore();
    store.OpenModal("unmap", ["slug-1"], vi.fn());
    expect(store.isConfirmModalOpen).toBe(true);
  });

  it("should return false when activeModal is null", () => {
    const {store} = makeStore();
    expect(store.isConfirmModalOpen).toBe(false);
  });
});

describe("outputName", () => {
  it("should return the output name when exactly one slug is set", () => {
    const {store} = makeStore({"my-slug": {name: "My Output"}});
    store.OpenModal("unmap", ["my-slug"], vi.fn());
    expect(store.outputName).toBe("My Output");
  });

  it("should return empty string when multiple slugs are set", () => {
    const {store} = makeStore({"a": {name: "A"}, "b": {name: "B"}});
    store.OpenModal("unmap", ["a", "b"], vi.fn());
    expect(store.outputName).toBe("");
  });

  it("should return empty string when no slugs are set", () => {
    const {store} = makeStore();
    expect(store.outputName).toBe("");
  });
});

describe("confirmConfig", () => {
  it("should return null when activeModal is null", () => {
    const {store} = makeStore();
    expect(store.confirmConfig).toBeNull();
  });

  it("should include descriptionSingular when one slug is set", () => {
    const {store} = makeStore({"a": {name: "A"}});
    store.OpenModal("unmap", ["a"], vi.fn());
    expect(store.confirmConfig?.description).toContain("this output");
  });

  it("should include descriptionPlural when multiple slugs are set", () => {
    const {store} = makeStore({"a": {name: "A"}, "b": {name: "B"}});
    store.OpenModal("unmap", ["a", "b"], vi.fn());
    expect(store.confirmConfig?.description).toContain("these outputs");
  });
});

// ---------------------------------------------------------------------------
// OpenModal / CloseModal
// ---------------------------------------------------------------------------

describe("OpenModal", () => {
  it("should set activeModal to remap when modal=map and an output already has a stream", () => {
    const {store} = makeStore({"slug-1": {name: "Out 1", input: {stream: "existing-stream"}}});
    store.OpenModal("map", ["slug-1"], vi.fn());
    expect(store.activeModal).toBe("remap");
  });

  it("should set activeModal to map when modal=map and no outputs have an existing stream", () => {
    const {store} = makeStore({"slug-1": {name: "Out 1"}});
    store.OpenModal("map", ["slug-1"], vi.fn());
    expect(store.activeModal).toBe("map");
  });

  it("should set activeModal directly for non-map actions", () => {
    const {store} = makeStore();
    store.OpenModal("delete", ["slug-1"], vi.fn());
    expect(store.activeModal).toBe("delete");
  });

  it("should set onSuccess to null when not provided", () => {
    const {store} = makeStore();
    store.OpenModal("unmap", ["slug-1"], undefined as any);
    expect(store.onSuccess).toBeNull();
  });
});

describe("CloseModal", () => {
  it("should set activeModal to null", () => {
    const {store} = makeStore();
    store.OpenModal("unmap", ["slug-1"], vi.fn());
    store.CloseModal();
    expect(store.activeModal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Confirm()
// ---------------------------------------------------------------------------

describe("Confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should transition activeModal from remap to map without calling any outputStore method", async () => {
    const {store, outputStore} = makeStore({"s": {name: "S", input: {stream: "existing"}}});
    store.OpenModal("map", ["s"], vi.fn());
    expect(store.activeModal).toBe("remap");

    await store.Confirm();

    expect(store.activeModal).toBe("map");
    expect(outputStore.UnmapStreamBatch).not.toHaveBeenCalled();
    expect(outputStore.EnableOutput).not.toHaveBeenCalled();
    expect(outputStore.DisableOutput).not.toHaveBeenCalled();
    expect(outputStore.DeleteOutput).not.toHaveBeenCalled();
    expect(outputStore.ResetOutput).not.toHaveBeenCalled();
  });

  it("should not call onSuccess or CloseModal when activeModal is remap", async () => {
    const onSuccess = vi.fn();
    const {store} = makeStore({"s": {name: "S", input: {stream: "existing"}}});
    store.OpenModal("map", ["s"], onSuccess);

    await store.Confirm();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(store.activeModal).toBe("map");
  });

  it("should call UnmapStreamBatch with all modal slugs when action is unmap", async () => {
    const {store, outputStore} = makeStore();
    store.OpenModal("unmap", ["out-1", "out-2"], vi.fn());

    await store.Confirm();

    expect(outputStore.UnmapStreamBatch).toHaveBeenCalledWith({outputs: ["out-1", "out-2"]});
  });

  it("should call ResetOutput with the first slug when action is reset", async () => {
    const {store, outputStore} = makeStore();
    store.OpenModal("reset", ["out-1"], vi.fn());

    await store.Confirm();

    expect(outputStore.ResetOutput).toHaveBeenCalledWith({outputId: "out-1"});
  });

  it("should call EnableOutput with the single slug when action is enable with one slug", async () => {
    const {store, outputStore} = makeStore();
    store.OpenModal("enable", ["out-1"], vi.fn());

    await store.Confirm();

    expect(outputStore.EnableOutput).toHaveBeenCalledWith({outputId: "out-1"});
    expect(outputStore.EnableOutputBatch).not.toHaveBeenCalled();
  });

  it("should call EnableOutputBatch with all slugs when action is enable with multiple slugs", async () => {
    const {store, outputStore} = makeStore();
    store.OpenModal("enable", ["out-1", "out-2", "out-3"], vi.fn());

    await store.Confirm();

    expect(outputStore.EnableOutputBatch).toHaveBeenCalledWith({outputs: ["out-1", "out-2", "out-3"]});
    expect(outputStore.EnableOutput).not.toHaveBeenCalled();
  });

  it("should call DisableOutput with the single slug when action is disable with one slug", async () => {
    const {store, outputStore} = makeStore();
    store.OpenModal("disable", ["out-1"], vi.fn());

    await store.Confirm();

    expect(outputStore.DisableOutput).toHaveBeenCalledWith({outputId: "out-1"});
    expect(outputStore.DisableOutputBatch).not.toHaveBeenCalled();
  });

  it("should call DisableOutputBatch with all slugs when action is disable with multiple slugs", async () => {
    const {store, outputStore} = makeStore();
    store.OpenModal("disable", ["out-1", "out-2"], vi.fn());

    await store.Confirm();

    expect(outputStore.DisableOutputBatch).toHaveBeenCalledWith({outputs: ["out-1", "out-2"]});
    expect(outputStore.DisableOutput).not.toHaveBeenCalled();
  });

  it("should call DeleteOutput with the single slug when action is delete with one slug", async () => {
    const {store, outputStore} = makeStore();
    store.OpenModal("delete", ["out-1"], vi.fn());

    await store.Confirm();

    expect(outputStore.DeleteOutput).toHaveBeenCalledWith({outputId: "out-1"});
    expect(outputStore.DeleteOutputBatch).not.toHaveBeenCalled();
  });

  it("should call DeleteOutputBatch with all slugs when action is delete with multiple slugs", async () => {
    const {store, outputStore} = makeStore();
    store.OpenModal("delete", ["out-1", "out-2"], vi.fn());

    await store.Confirm();

    expect(outputStore.DeleteOutputBatch).toHaveBeenCalledWith({outputs: ["out-1", "out-2"]});
    expect(outputStore.DeleteOutput).not.toHaveBeenCalled();
  });

  it("should call onSuccess after the action completes", async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const {store} = makeStore();
    store.OpenModal("unmap", ["out-1"], onSuccess);

    await store.Confirm();

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("should close the modal after the action and onSuccess complete", async () => {
    const {store} = makeStore();
    store.OpenModal("unmap", ["out-1"], vi.fn());

    await store.Confirm();

    expect(store.activeModal).toBeNull();
  });

  it("should close the modal even when onSuccess is null", async () => {
    const {store} = makeStore();
    store.OpenModal("unmap", ["out-1"], undefined as any);

    await store.Confirm();

    expect(store.activeModal).toBeNull();
  });

  it("should call onSuccess before closing the modal", async () => {
    const callOrder: string[] = [];
    const onSuccess = vi.fn().mockImplementation(() => {
      callOrder.push("onSuccess");
      return Promise.resolve();
    });
    const {store} = makeStore();
    store.OpenModal("delete", ["out-1"], onSuccess);

    await store.Confirm();

    callOrder.push("modalClosed:" + String(store.activeModal));
    expect(callOrder[0]).toBe("onSuccess");
    expect(store.activeModal).toBeNull();
  });
});
