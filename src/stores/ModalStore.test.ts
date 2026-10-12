import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
}));

vi.mock("@/stores", () => ({}));

import ModalStore from "./ModalStore";

const makeStore = ({dependentIds = ["iq__dep1", "iq__dep2"], statuses = {} as Record<string, string>} = {}) => {
  const streamStore = {
    client: {
      ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib1"),
      ContentObjectMetadata: vi.fn().mockResolvedValue(dependentIds)
    },
    StartStream: vi.fn().mockResolvedValue(undefined),
    StreamStatuses: vi.fn().mockImplementation((ids: string[]) =>
      Promise.resolve(Object.fromEntries(ids.map(id => [id, {status: statuses[id] ?? "inactive"}])))
    )
  };
  const store = new ModalStore({streamStore} as any) as any;
  return {store, streamStore};
};

const openStartModal = async(store: any) => {
  const notifications = {show: vi.fn()};
  store.SetModal({data: {objectId: "iq__parent", name: "Parent"}, op: "START", slug: "parent", notifications});
  await vi.waitFor(() => expect(store.modalData.dependentsLoading).toBe(false));
  return notifications;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ModalStore dependent streams", () => {
  it("starts the parent and its ready dependents", async () => {
    const {store, streamStore} = makeStore();
    await openStartModal(store);

    await store.modalData.ConfirmCallback();

    const started = streamStore.StartStream.mock.calls.map(c => c[0].objectId).sort();
    expect(started).toEqual(["iq__dep1", "iq__dep2", "iq__parent"]);
  });

  it("re-checks dependent statuses at confirm time and skips ones no longer ready", async () => {
    const {store, streamStore} = makeStore();
    await openStartModal(store);
    // dep2 started elsewhere while the modal was open
    streamStore.StreamStatuses.mockImplementation((ids: string[]) =>
      Promise.resolve(Object.fromEntries(ids.map(id => [id, {status: id === "iq__dep2" ? "running" : "inactive"}])))
    );

    await store.modalData.ConfirmCallback();

    const started = streamStore.StartStream.mock.calls.map(c => c[0].objectId);
    expect(started).not.toContain("iq__dep2");
    expect(started).toContain("iq__dep1");
  });

  it("skips dependents when the checkbox is off", async () => {
    const {store, streamStore} = makeStore();
    await openStartModal(store);
    store.SetIncludeDependents(false);

    await store.modalData.ConfirmCallback();

    expect(streamStore.StartStream.mock.calls.map(c => c[0].objectId)).toEqual(["iq__parent"]);
  });

  it("reports a dependent failure separately without failing the parent", async () => {
    const {store, streamStore} = makeStore();
    const notifications = await openStartModal(store);
    streamStore.StartStream.mockImplementation(({objectId}: {objectId: string}) =>
      objectId === "iq__dep1" ? Promise.reject(new Error("boom")) : Promise.resolve()
    );

    await expect(store.modalData.ConfirmCallback()).resolves.toBeUndefined();

    expect(streamStore.StartStream).toHaveBeenCalledTimes(3);
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({
      title: "Started Stream"
    }));
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({
      color: "red",
      message: "Unable to start 1 of 2 dependent streams"
    }));
  });

  it("still attempts dependents and rethrows when the parent fails", async () => {
    const {store, streamStore} = makeStore();
    await openStartModal(store);
    streamStore.StartStream.mockImplementation(({objectId}: {objectId: string}) =>
      objectId === "iq__parent" ? Promise.reject(new Error("parent failed")) : Promise.resolve()
    );

    await expect(store.modalData.ConfirmCallback()).rejects.toThrow("parent failed");
    expect(streamStore.StartStream).toHaveBeenCalledTimes(3);
  });
});
