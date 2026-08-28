import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val: unknown) => val
}));

vi.mock("@/stores", () => ({}));

import StreamStore from "@/stores/StreamStore";
import {STATUS_MAP} from "@/utils/constants";

// Sequential stand-in for client.utils.LimitedMap.
const LimitedMap = async (_n: number, items: unknown[], fn: (item: unknown) => Promise<unknown>) => {
  for(const item of items) { await fn(item); }
};

interface MetaByObject {
  [objectId: string]: unknown;
}

const makeStore = ({streams = {}, meta = {} as MetaByObject, statusState = "running", tenantContent} = {} as any) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-x"),
    ContentObjectMetadata: vi.fn().mockImplementation(({objectId}) => Promise.resolve(meta[objectId] ?? null)),
    StreamStatus: vi.fn().mockImplementation(({name}) => Promise.resolve({state: statusState, name})),
    StreamStartRecording: vi.fn().mockResolvedValue(undefined),
    StreamStartOrStopOrReset: vi.fn().mockResolvedValue({state: "starting"}),
    StreamStopRecording: vi.fn().mockResolvedValue({state: "inactive"}),
    TenantContent: vi.fn().mockImplementation(tenantContent ?? (() => Promise.resolve({versions: [], paging: {more: false}}))),
    utils: {LimitedMap}
  };

  const rootStore = {
    client: mockClient,
    streamGroupStore: {BuildGroups: vi.fn()},
    dataStore: {}
  };

  const store = new StreamStore(rootStore as any) as any;
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

describe("StreamStore._ClassifyStreams", () => {
  it("classifies streams from local metadata without a StreamStatus call", async () => {
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
    expect(mockClient.StreamStatus).not.toHaveBeenCalled();
  });

  it("reuses the cached libraryId instead of resolving it", async () => {
    const streams = {a: {slug: "a", objectId: "iq__a", libraryId: "ilib-cached"}};
    const {store, mockClient} = makeStore({streams, meta: {iq__a: streamMeta({token: "t"})}});

    await store._ClassifyStreams({slugs: ["a"]});

    expect(mockClient.ContentObjectLibraryId).not.toHaveBeenCalled();
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({libraryId: "ilib-cached", objectId: "iq__a"})
    );
  });
});

describe("StreamStore.AllStreamsStatus", () => {
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

    await store.AllStreamsStatus();

    expect(mockClient.StreamStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.StreamStatus).toHaveBeenCalledWith(expect.objectContaining({name: "iq__l"}));
    expect(store.streams.live.status).toBe("running");
    expect(store.streams.idle.status).toBe(STATUS_MAP.INACTIVE);
  });
});

describe("StreamStore._SetStreamActive", () => {
  it("adds and removes slugs, writing the resolved state on removal", () => {
    const {store} = makeStore({streams: {a: {slug: "a", objectId: "iq__a"}}});

    store._SetStreamActive({slug: "a", active: true});
    expect(store.activeStreamSlugs.has("a")).toBe(true);

    store._SetStreamActive({slug: "a", active: false, state: STATUS_MAP.INACTIVE});
    expect(store.activeStreamSlugs.has("a")).toBe(false);
    expect(store.streams.a.status).toBe(STATUS_MAP.INACTIVE);
  });
});

describe("StreamStore.SetStreamSort", () => {
  it("maps sortable columns to tenant-query fields and reports real changes", () => {
    const {store} = makeStore();

    expect(store.SetStreamSort({columnAccessor: "title", direction: "asc"})).toBe(true);
    expect(store.streamSort).toEqual({field: "name", desc: false});

    // Same field + direction -> no change.
    expect(store.SetStreamSort({columnAccessor: "title", direction: "asc"})).toBe(false);

    // Direction flip -> change.
    expect(store.SetStreamSort({columnAccessor: "title", direction: "desc"})).toBe(true);
    expect(store.streamSort).toEqual({field: "name", desc: true});

    expect(store.SetStreamSort({columnAccessor: "date", direction: "desc"})).toBe(true);
    expect(store.streamSort).toEqual({field: "date", desc: true});
  });

  it("keeps the last server sort for client-only columns and returns false", () => {
    const {store} = makeStore();
    store.SetStreamSort({columnAccessor: "date", direction: "asc"});

    expect(store.SetStreamSort({columnAccessor: "status", direction: "asc"})).toBe(false);
    expect(store.streamSort).toEqual({field: "date", desc: false});
  });
});

describe("StreamStore tenant-query sort", () => {
  it("passes the active sort to TenantContent and reuses it for the next page", async () => {
    const pages = [
      {versions: [{id: "iq__1", hash: "hq__1", query_fields: {name: "A"}}], paging: {more: true}},
      {versions: [{id: "iq__2", hash: "hq__2", query_fields: {name: "B"}}], paging: {more: false}}
    ];
    const TenantContent = vi.fn()
      .mockResolvedValueOnce(pages[0])
      .mockResolvedValueOnce(pages[1]);
    const {store, mockClient} = makeStore({tenantContent: TenantContent});
    mockClient.TenantContent = TenantContent;

    store.SetStreamSort({columnAccessor: "title", direction: "asc"});
    await store.LoadTenantLiveStreamContent({siteId: "iq__site", paged: true});

    expect(TenantContent.mock.calls[0][0]).toMatchObject({
      sortOptions: {field: "name", desc: false}
    });

    await store.LoadMoreTenantLiveStreamContent();
    expect(TenantContent.mock.calls[1][0]).toMatchObject({
      sortOptions: {field: "name", desc: false}
    });
  });

  it("omits sortOptions when no column maps to an indexed field", async () => {
    const TenantContent = vi.fn().mockResolvedValue({versions: [], paging: {more: false}});
    const {store} = makeStore();
    store.client.TenantContent = TenantContent;
    store.streamSort = null;

    await store.LoadTenantLiveStreamContent({siteId: "iq__site", paged: true});

    expect(TenantContent.mock.calls[0][0]).not.toHaveProperty("sortOptions");
  });
});

describe("StreamStore active-set maintenance", () => {
  it("StartStream marks the stream active before the next poll", async () => {
    const streams = {a: {slug: "a", objectId: "iq__a", libraryId: "l"}};
    const {store, mockClient} = makeStore({streams});
    mockClient.StreamStatus.mockResolvedValueOnce({state: "inactive"});

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

  it("UpdateStreams prunes active slugs no longer in the list", () => {
    const {store} = makeStore({streams: {a: {slug: "a", objectId: "iq__a"}}});
    store.activeStreamSlugs.add("a");
    store.activeStreamSlugs.add("gone");

    store.UpdateStreams({streams: {a: {slug: "a", objectId: "iq__a"}}});

    expect(store.activeStreamSlugs.has("a")).toBe(true);
    expect(store.activeStreamSlugs.has("gone")).toBe(false);
  });
});
