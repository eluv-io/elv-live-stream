import {describe, it, expect, vi, afterEach, type Mock} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val) => val
}));

vi.mock("@/stores", () => ({}));
vi.mock("@/utils/constants", () => ({
  STATUS_MAP: {},
  DETAILS_TABS: []
}));

import RecordingCopyStore from "@/stores/streams/RecordingCopyStore";

// autoBind makes bound flows non-writable own properties, so stub the prototype generator before construction.
const prototypeSpies: ReturnType<typeof vi.spyOn>[] = [];
const stubFlow = (name: string, resolved: unknown = undefined) => {
  const spy = vi.spyOn(RecordingCopyStore.prototype as any, name).mockResolvedValue(resolved);
  prototypeSpies.push(spy);
  return spy as unknown as Mock;
};
afterEach(() => {
  prototypeSpies.splice(0).forEach(spy => spy.mockRestore());
});

const makeCopyToVodStore = ({
  titleContentType = null,
  streams = {"my-stream": {objectId: "iq__src", title: "My Stream"}} as Record<string, {objectId: string; title: string}>,
  copyVodResponse = {jobId: "job-123"} as Record<string, unknown>,
  copiesMetadata = null,
} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("source-lib"),
    CreateContentObject: vi.fn().mockResolvedValue({id: "iq__new", writeToken: "new-wt"}),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
    SetPermission: vi.fn().mockResolvedValue(undefined),
    StreamCopyToVod: vi.fn().mockResolvedValue(copyVodResponse),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "edit-wt"}),
    ContentObjectMetadata: vi.fn().mockResolvedValue(copiesMetadata),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
  };

  const mockRootStore = {
    client: mockClient,
    dataStore: {titleContentType},
    profileStore: {profiles: {}},
    streamStatusStore: {streams}
  };

  const addAccessGroupSpy = vi.fn().mockResolvedValue(undefined);
  const store = new RecordingCopyStore({...mockRootStore, streamEditStore: {AddAccessGroupPermission: addAccessGroupSpy}}) as any;

  return {store, mockClient, addAccessGroupSpy};
};

describe("CopyToVod", () => {
  const singlePeriod = [{id: "period-1", start_time_epoch_sec: 1700000000, end_time_epoch_sec: 1700003600}];
  const multiPeriods = [
    {id: "period-1", start_time_epoch_sec: 1700000000, end_time_epoch_sec: 1700003600},
    {id: "period-2", start_time_epoch_sec: 1700003600, end_time_epoch_sec: 1700007200}
  ];

  it("passes recordingPeriod id for single period", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(mockClient.StreamCopyToVod).toHaveBeenCalledWith(
      expect.objectContaining({recordingPeriod: "period-1", startTime: undefined, endTime: undefined})
    );
  });

  it("sets recordingPeriod=null and startTime/endTime for multiple periods", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: multiPeriods});
    const call = mockClient.StreamCopyToVod.mock.calls[0][0];
    expect(call.recordingPeriod).toBeNull();
    expect(call.startTime).toBe(new Date(1700000000 * 1000).toISOString());
    expect(call.endTime).toBe(new Date(1700007200 * 1000).toISOString());
  });

  it("falls back to current time when period has no end_time_epoch_sec", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    const periodNoEnd = [{id: "p1", start_time_epoch_sec: 1700000000}];
    const before = Math.floor(Date.now() / 1000);
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: periodNoEnd});
    const after = Math.floor(Date.now() / 1000);

    // The copies metadata endTime should be in the current-time range
    const replaceCall = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    const savedEndTime = replaceCall[0].metadata["iq__new"].endTime;
    expect(savedEndTime).toBeGreaterThanOrEqual(before);
    expect(savedEndTime).toBeLessThanOrEqual(after);
  });

  it("fetches targetLibraryId when not provided", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", selectedPeriods: singlePeriod});
    // First call is for the target library; second is for source after StreamCopyToVod
    expect(mockClient.ContentObjectLibraryId.mock.calls[0]).toEqual([{objectId: "iq__src"}]);
  });

  it("skips ContentObjectLibraryId for target when targetLibraryId is provided", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    // Only one call: after StreamCopyToVod for the source object
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledTimes(1);
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__src"});
  });

  it("uses provided title", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod, title: "My Custom Title"});
    expect(mockClient.CreateContentObject).toHaveBeenCalledWith(
      expect.objectContaining({options: {}})
    );
    // title passed to StreamCopyToVod indirectly via copies metadata
    const replaceCall = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(replaceCall[0].metadata["iq__new"].title).toBe("My Custom Title");
  });

  it("falls back to stream title from streams store", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(replaceCall[0].metadata["iq__new"].title).toBe("My Stream VoD");
  });

  it("falls back to objectId when no stream slug matches", async () => {
    const {store, mockClient} = makeCopyToVodStore({streams: {}});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(replaceCall[0].metadata["iq__new"].title).toBe("iq__src VoD");
  });

  it("passes type and meta to CreateContentObject when titleContentType is set", async () => {
    const {store, mockClient} = makeCopyToVodStore({titleContentType: "hq__typehash"});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod, title: "T"});
    expect(mockClient.CreateContentObject).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {type: "hq__typehash", meta: {public: {name: "T"}}}
      })
    );
  });

  it("passes empty options to CreateContentObject when titleContentType is falsy", async () => {
    const {store, mockClient} = makeCopyToVodStore({titleContentType: null});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(mockClient.CreateContentObject).toHaveBeenCalledWith(
      expect.objectContaining({options: {}})
    );
  });

  it("finalizes the new VoD object before StreamCopyToVod", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__new", commitMessage: "Create VoD object"})
    );
  });

  it("propagates error when FinalizeContentObject (target) throws", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    mockClient.FinalizeContentObject.mockRejectedValueOnce(new Error("Finalize failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod})
    ).rejects.toThrow("Finalize failed");
    consoleSpy.mockRestore();
  });

  it("sets editable permission on the new VoD object", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(mockClient.SetPermission).toHaveBeenCalledWith({objectId: "iq__new", permission: "editable"});
  });

  it("propagates error when SetPermission throws", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    mockClient.SetPermission.mockRejectedValueOnce(new Error("Permission denied"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod})
    ).rejects.toThrow("Permission denied");
    consoleSpy.mockRestore();
  });

  it("calls AddAccessGroupPermission when accessGroup is provided", async () => {
    const {store, addAccessGroupSpy} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod, accessGroup: "editors"});
    expect(addAccessGroupSpy).toHaveBeenCalledWith({objectId: "iq__new", groupName: "editors"});
  });

  it("skips AddAccessGroupPermission when accessGroup is not provided", async () => {
    const {store, addAccessGroupSpy} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(addAccessGroupSpy).not.toHaveBeenCalled();
  });

  it("throws when StreamCopyToVod returns a falsy response", async () => {
    const {store} = makeCopyToVodStore({copyVodResponse: null});
    await expect(
      store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod})
    ).rejects.toThrow("Unable to copy to VoD. Is part available?");
  });

  it("writes copies metadata and finalizes source object on success", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});

    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "iq__src",
        metadataSubtree: "/live_recording_copies",
        metadata: expect.objectContaining({
          "iq__new": expect.objectContaining({
            startTime: 1700000000,
            endTime: 1700003600,
          })
        })
      })
    );
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__src", commitMessage: "Update live recording copies"})
    );
  });

  it("initializes copiesMetadata to empty object when null", async () => {
    const {store, mockClient} = makeCopyToVodStore({copiesMetadata: null});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    const call = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(Object.keys(call[0].metadata)).toEqual(["iq__new"]);
  });

  it("merges new entry into existing copiesMetadata", async () => {
    const existing = {"iq__old": {startTime: 1699000000, endTime: 1699003600, title: "Old VoD"}};
    const {store, mockClient} = makeCopyToVodStore({copiesMetadata: existing});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    const call = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(call[0].metadata["iq__old"]).toBeDefined();
    expect(call[0].metadata["iq__new"]).toBeDefined();
  });

  it("returns the StreamCopyToVod response", async () => {
    const {store} = makeCopyToVodStore({copyVodResponse: {jobId: "abc", status: "ok"}});
    const result = await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(result).toEqual({jobId: "abc", status: "ok"});
  });
});

describe("FetchLiveRecordingCopies", () => {
  const makeFetchStore = (copiesData = {"copy-1": {title: "Copy 1"}}) => {
    const mockClient = {
      ContentObjectLibraryId: vi.fn().mockResolvedValue("fetched-lib"),
      ContentObjectMetadata: vi.fn().mockResolvedValue(copiesData),
    };
    const store = new RecordingCopyStore({
      client: mockClient,
      dataStore: {},
      profileStore: {profiles: {}},
      streamStatusStore: {}
    }) as any;
    return {store, mockClient};
  };

  it("fetches libraryId when not provided", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj"});
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__obj"});
  });

  it("skips ContentObjectLibraryId when libraryId is already provided", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(mockClient.ContentObjectLibraryId).not.toHaveBeenCalledWith({objectId: "iq__obj"});
  });

  it("uses the provided libraryId in the metadata call", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({libraryId: "ilib-given"})
    );
  });

  it("uses the fetched libraryId in the metadata call when none is provided", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj"});
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({libraryId: "fetched-lib"})
    );
  });

  it("reads from the live_recording_copies subtree", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_copies"})
    );
  });

  it("returns the ContentObjectMetadata result", async () => {
    const copies = {"copy-1": {title: "A"}, "copy-2": {title: "B"}};
    const {store} = makeFetchStore(copies);
    const result = await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(result).toEqual(copies);
  });

  it("returns null when there are no copies", async () => {
    const {store} = makeFetchStore(null);
    const result = await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(result).toBeNull();
  });
});

const makeDeleteCopyStore = (initialCopies: Record<string, {title: string}> = {"copy-1": {title: "Copy 1"}, "copy-2": {title: "Copy 2"}}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("lib-1"),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-del"}),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    FinalizeContentObject: vi.fn().mockResolvedValue({hash: "hq__finalized"}),
  };

  // Stub FetchLiveRecordingCopies to avoid its internal client calls
  const fetchCopiesSpy = stubFlow("FetchLiveRecordingCopies", {...initialCopies});
  const store = new RecordingCopyStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStatusStore: {}
  }) as any;

  return {store, mockClient, fetchCopiesSpy};
};

describe("DeleteLiveRecordingCopy", () => {
  it("calls FetchLiveRecordingCopies with the streamId", async () => {
    const {store, fetchCopiesSpy} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(fetchCopiesSpy).toHaveBeenCalledWith({objectId: "iq__stream"});
  });

  it("removes the specified recordingCopyId", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls[0][0];
    expect(replaceCall.metadata["copy-1"]).toBeUndefined();
  });

  it("preserves other entries when deleting one", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls[0][0];
    expect(replaceCall.metadata["copy-2"]).toEqual({title: "Copy 2"});
  });

  it("results in empty metadata when deleting the only entry", async () => {
    const {store, mockClient} = makeDeleteCopyStore({"copy-1": {title: "Only Copy"}});
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls[0][0];
    expect(replaceCall.metadata).toEqual({});
  });

  it("is a no-op delete when recordingCopyId does not exist", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-999"});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls[0][0];
    expect(Object.keys(replaceCall.metadata)).toEqual(["copy-1", "copy-2"]);
  });

  it("fetches libraryId via ContentObjectLibraryId", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__stream"});
  });

  it("opens a write token via EditContentObject", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(mockClient.EditContentObject).toHaveBeenCalledWith({objectId: "iq__stream", libraryId: "lib-1"});
  });

  it("writes updated copies to live_recording_copies subtree", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "iq__stream",
        libraryId: "lib-1",
        writeToken: "wt-del",
        metadataSubtree: "live_recording_copies",
      })
    );
  });

  it("finalizes with the correct commit message", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "iq__stream",
        libraryId: "lib-1",
        writeToken: "wt-del",
        commitMessage: "Remove live recording copy",
      })
    );
  });

  it("returns the FinalizeContentObject response", async () => {
    const {store} = makeDeleteCopyStore();
    const result = await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(result).toEqual({hash: "hq__finalized"});
  });
});
