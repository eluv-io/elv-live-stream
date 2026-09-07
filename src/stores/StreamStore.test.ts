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
    SetNodes: vi.fn(),
    ResetRegion: vi.fn().mockResolvedValue(undefined),
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

describe("StreamStore tenant-query node pinning", () => {
  it("pins the fabric node before each TenantContent call and resets the region after", async () => {
    const tenantContent = vi.fn()
      .mockResolvedValueOnce({versions: [{id: "iq__1", hash: "hq__1"}], paging: {more: true}})
      .mockResolvedValueOnce({versions: [{id: "iq__2", hash: "hq__2"}], paging: {more: false}});
    const {store, mockClient} = makeStore({tenantContent});

    // Non-paged load pages through everything in one call.
    await store.LoadTenantLiveStreamContent({siteId: "iq__site"});

    expect(mockClient.SetNodes).toHaveBeenCalledWith({
      fabricURIs: ["https://host-154-14-243-34.contentfabric.io"]
    });
    expect(mockClient.SetNodes).toHaveBeenCalledTimes(2);
    expect(mockClient.ResetRegion).toHaveBeenCalledTimes(2);
  });

  it("resets the region even when TenantContent throws", async () => {
    const {store, mockClient} = makeStore({tenantContent: vi.fn().mockRejectedValue(new Error("boom"))});

    await store.LoadTenantLiveStreamContent({siteId: "iq__site"});

    expect(mockClient.ResetRegion).toHaveBeenCalledTimes(1);
  });

  it("passes the name search to the tenant query as a name:co: filter", async () => {
    const tenantContent = vi.fn().mockResolvedValue({versions: [], paging: {more: false}});
    const {store} = makeStore({tenantContent});

    await store.LoadTenantLiveStreamContent({siteId: "iq__site", nameFilter: "  Final Match  "});

    expect(tenantContent).toHaveBeenCalledWith(expect.objectContaining({
      filter: ["group:eq:iq__site", "name:co:Final Match"]
    }));
  });

  it("omits the name filter when the search is blank and carries it into load-more", async () => {
    const tenantContent = vi.fn().mockResolvedValue({versions: [], paging: {more: true}});
    const {store} = makeStore({tenantContent});

    await store.LoadTenantLiveStreamContent({siteId: "iq__site", nameFilter: "quarterfinal", paged: true});
    expect(tenantContent).toHaveBeenLastCalledWith(expect.objectContaining({filter: ["group:eq:iq__site", "name:co:quarterfinal"]}));

    await store.LoadMoreTenantLiveStreamContent();
    expect(tenantContent).toHaveBeenLastCalledWith(expect.objectContaining({filter: ["group:eq:iq__site", "name:co:quarterfinal"]}));
  });
});

describe("StreamStore.filteredStreams", () => {
  const streams = {
    a: {slug: "a", objectId: "iq__a", title: "Alpha", tags: ["x"]},
    b: {slug: "b", objectId: "iq__b", title: "Beta", tags: ["y"]}
  };

  it("applies the text filter client-side on the legacy path", () => {
    const {store} = makeStore({streams});
    store.rootStore.dataStore.useContentGroup = false;
    store.SetTableFilter("alph");

    expect(store.filteredStreams.map((s: any) => s.slug)).toEqual(["a"]);
  });

  it("skips the client-side text filter on the content-group path (server-side search)", () => {
    const {store} = makeStore({streams});
    store.rootStore.dataStore.useContentGroup = true;
    store.SetTableFilter("alph");

    expect(store.filteredStreams.map((s: any) => s.slug)).toEqual(["a", "b"]);
  });

  it("filters by object id client-side even on the content-group path", () => {
    const {store} = makeStore({streams});
    store.rootStore.dataStore.useContentGroup = true;
    store.SetTableFilter("iq__a");

    expect(store.tableFilterIsObjectId).toBe(true);
    expect(store.filteredStreams.map((s: any) => s.slug)).toEqual(["a"]);
  });

  it("treats a partial 'iq__' term (and surrounding whitespace) as an object-id search", () => {
    const {store} = makeStore({streams});
    store.SetTableFilter("  iq__  ");
    expect(store.tableFilterIsObjectId).toBe(true);

    store.SetTableFilter("Final Match");
    expect(store.tableFilterIsObjectId).toBe(false);
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
