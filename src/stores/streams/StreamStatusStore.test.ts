import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val: unknown) => val
}));

vi.mock("@/stores", () => ({}));

import StreamStatusStore from "@/stores/streams/StreamStatusStore";
import {STATUS_MAP} from "@/utils/constants";
import {LocalStateFromMeta} from "@/stores/lib/tenantContent";

// Sequential stand-in for client.utils.LimitedMap.
const LimitedMap = async (_n: number, items: unknown[], fn: (item: unknown) => Promise<unknown>) => {
  for(const item of items) { await fn(item); }
};

interface MetaByObject {
  [objectId: string]: unknown;
}

const makeStore = ({streams = {}, meta = {} as MetaByObject, statusState = "running", tenantContent, useContentGroup = true} = {} as any) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-x"),
    ContentObjectMetadata: vi.fn().mockImplementation(({objectId}) => Promise.resolve(meta[objectId] ?? null)),
    StreamRunningState: vi.fn().mockImplementation(({objectId}) => Promise.resolve({state: statusState, objectId})),
    StreamStartRecording: vi.fn().mockResolvedValue(undefined),
    StreamStartOrStopOrReset: vi.fn().mockResolvedValue({state: "starting"}),
    StreamStopRecording: vi.fn().mockResolvedValue({state: "inactive"}),
    TenantContent: vi.fn().mockImplementation(tenantContent ?? (() => Promise.resolve({versions: [], paging: {more: false}}))),
    SetNodes: vi.fn(),
    ResetRegion: vi.fn().mockResolvedValue(undefined),
    utils: {LimitedMap}
  };

  const rootStore = {
    client: mockClient,
    streamGroupStore: {BuildGroups: vi.fn()},
    tenantStore: {},
    settingsStore: {useContentGroup}
  };

  const store = new StreamStatusStore(rootStore as any) as any;
  // Seed the tenant-query cache the store reads local state from.
  Object.values(streams as Record<string, any>).forEach(stream => {
    if(meta[stream.objectId]) { stream.queryLocalState = LocalStateFromMeta(meta[stream.objectId] as any); }
  });
  store.streams = streams;
  return {store, mockClient};
};

const streamMeta = ({url = "srt://in", token = "", ingress = "https://node", initialized = true} = {}) => ({
  live_recording_config: url ? {url} : undefined,
  live_recording: {
    fabric_config: {ingress_node_api: ingress, edge_write_token: ""},
    playout_config: initialized ? {} : undefined,
    recording_config: initialized ? {} : undefined,
    status: {edge_write_token: token}
  }
});

beforeEach(() => vi.clearAllMocks());

describe("StreamStatusStore._ClassifyStreams", () => {
  it("classifies streams from local metadata without a StreamRunningState call", async () => {
    const streams = {
      unconf: {slug: "unconf", objectId: "iq__1", libraryId: "ilib1"},
      uninit: {slug: "uninit", objectId: "iq__2", libraryId: "ilib2"},
      idle: {slug: "idle", objectId: "iq__3", libraryId: "ilib3"},
      live: {slug: "live", objectId: "iq__4", libraryId: "ilib4"}
    };
    const meta = {
      iq__1: streamMeta({url: ""}),
      iq__2: streamMeta({initialized: false}),
      iq__3: streamMeta({token: ""}),
      iq__4: streamMeta({token: "tqw__live"})
    };
    const {store, mockClient} = makeStore({streams, meta});

    const active = await store._ClassifyStreams({slugs: Object.keys(streams)});

    expect(active).toEqual(["live"]);
    expect([...store.activeStreamSlugs]).toEqual(["live"]);
    expect(store.streams.unconf.status).toBe(STATUS_MAP.UNCONFIGURED);
    expect(store.streams.uninit.status).toBe(STATUS_MAP.UNINITIALIZED);
    expect(store.streams.idle.status).toBe(STATUS_MAP.INACTIVE);
    expect(store.streams.live.status).toBeUndefined();
    expect(mockClient.StreamRunningState).not.toHaveBeenCalled();
  });

  it("reads metadata for streams without tenant-query state (legacy flow)", async () => {
    const streams = {a: {slug: "a", objectId: "iq__a", libraryId: "ilib-cached"}};
    const {store, mockClient} = makeStore({streams});
    mockClient.ContentObjectMetadata.mockResolvedValue(streamMeta({token: "t"}));

    const active = await store._ClassifyStreams({slugs: ["a"]});

    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({libraryId: "ilib-cached", objectId: "iq__a"})
    );
    expect(active).toEqual(["a"]);
  });

  it("_ReadLocalState uses tenant-query state on the first read only, then reads metadata", async () => {
    const streams = {a: {slug: "a", objectId: "iq__a", libraryId: "l"}};
    const {store, mockClient} = makeStore({streams, meta: {iq__a: streamMeta({token: ""})}});
    mockClient.ContentObjectMetadata.mockResolvedValue(streamMeta({token: "t"}));

    expect((await store._ReadLocalState({objectId: "iq__a"})).state).toBe(STATUS_MAP.INACTIVE);
    expect(mockClient.ContentObjectMetadata).not.toHaveBeenCalled();

    expect((await store._ReadLocalState({objectId: "iq__a"})).edgeWriteToken).toBe("t");
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledTimes(1);
  });

  it("does not re-read already-classified content-group streams on later passes", async () => {
    const streams = {
      idle: {slug: "idle", objectId: "iq__i", libraryId: "l"},
      live: {slug: "live", objectId: "iq__l", libraryId: "l"}
    };
    const meta = {iq__i: streamMeta({token: ""}), iq__l: streamMeta({token: "t"})};
    const {store, mockClient} = makeStore({streams, meta});

    await store._ClassifyStreams({slugs: ["idle", "live"]});
    const active = await store._ClassifyStreams({slugs: ["idle", "live"]});

    expect(mockClient.ContentObjectMetadata).not.toHaveBeenCalled();
    expect(active).toEqual(["live"]);
  });

  it("reuses the cached libraryId and makes no metadata read", async () => {
    const streams = {a: {slug: "a", objectId: "iq__a", libraryId: "ilib-cached"}};
    const {store, mockClient} = makeStore({streams, meta: {iq__a: streamMeta({token: "t"})}});

    await store._ClassifyStreams({slugs: ["a"]});

    expect(mockClient.ContentObjectLibraryId).not.toHaveBeenCalled();
    expect(mockClient.ContentObjectMetadata).not.toHaveBeenCalled();
  });
});

describe("StreamStatusStore.LoadAllStreamsStatus", () => {
  it("polls full status only for active streams", async () => {
    const streams = {
      idle: {slug: "idle", objectId: "iq__i", libraryId: "l"},
      live: {slug: "live", objectId: "iq__l", libraryId: "l"}
    };
    const meta = {
      iq__i: streamMeta({token: ""}),
      iq__l: streamMeta({token: "t"})
    };
    const {store, mockClient} = makeStore({streams, meta, statusState: "running"});

    await store.LoadAllStreamsStatus();

    expect(mockClient.ContentObjectMetadata).not.toHaveBeenCalled();
    expect(mockClient.StreamRunningState).toHaveBeenCalledTimes(1);
    expect(mockClient.StreamRunningState).toHaveBeenCalledWith(expect.objectContaining({objectId: "iq__l", edgeWriteToken: "t"}));
    expect(store.streams.live.status).toBe("running");
    expect(store.streams.idle.status).toBe(STATUS_MAP.INACTIVE);
  });
});

describe("StreamStatusStore._SetStreamActive", () => {
  it("adds and removes slugs, writing the resolved state on removal", () => {
    const {store} = makeStore({streams: {a: {slug: "a", objectId: "iq__a"}}});

    store._SetStreamActive({slug: "a", active: true});
    expect(store.activeStreamSlugs.has("a")).toBe(true);

    store._SetStreamActive({slug: "a", active: false, state: STATUS_MAP.INACTIVE});
    expect(store.activeStreamSlugs.has("a")).toBe(false);
    expect(store.streams.a.status).toBe(STATUS_MAP.INACTIVE);
  });
});

describe("StreamStatusStore active-set maintenance", () => {
  it("StartStream marks the stream active before the next poll", async () => {
    const streams = {a: {slug: "a", objectId: "iq__a", libraryId: "l"}};
    const {store} = makeStore({streams, meta: {iq__a: streamMeta()}});

    await store.StartStream({slug: "a"});

    expect(store.activeStreamSlugs.has("a")).toBe(true);
  });

  it("DeactivateStream drops the stream from the active set", async () => {
    const streams = {a: {slug: "a", objectId: "iq__a", libraryId: "l"}};
    const {store} = makeStore({streams});
    store.activeStreamSlugs.add("a");

    await store.DeactivateStream({objectId: "iq__a", slug: "a"});

    expect(store.activeStreamSlugs.has("a")).toBe(false);
    expect(store.streams.a.status).toBe("inactive");
  });

  it("_ReplaceStreams prunes active slugs no longer in the list", () => {
    const {store} = makeStore({streams: {a: {slug: "a", objectId: "iq__a"}}});
    store.activeStreamSlugs.add("a");
    store.activeStreamSlugs.add("gone");

    store._ReplaceStreams({streams: {a: {slug: "a", objectId: "iq__a"}}});

    expect(store.activeStreamSlugs.has("a")).toBe(true);
    expect(store.activeStreamSlugs.has("gone")).toBe(false);
  });
});
