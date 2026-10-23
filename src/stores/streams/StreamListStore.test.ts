import {describe, it, expect, vi} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val: unknown) => val
}));

vi.mock("@/stores", () => ({}));

import StreamListStore from "@/stores/streams/StreamListStore";

interface MetaByObject {
  [objectId: string]: unknown;
}

const makeStore = ({streams = {}, meta = {} as MetaByObject, tenantContent} = {} as any) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-x"),
    ContentObjectMetadata: vi.fn().mockImplementation(({objectId}) => Promise.resolve(meta[objectId] ?? null)),
    TenantContent: vi.fn().mockImplementation(tenantContent ?? (() => Promise.resolve({versions: [], paging: {more: false}}))),
    SetNodes: vi.fn(),
    ResetRegion: vi.fn().mockResolvedValue(undefined)
  };

  const streamStatusStore = {
    streams,
    _ReplaceStreams: vi.fn(({streams: next}) => { streamStatusStore.streams = next; })
  };

  const rootStore = {
    client: mockClient,
    streamStatusStore,
    streamGroupStore: {BuildGroups: vi.fn()},
    tenantStore: {},
    settingsStore: {
      declaredTags: [] as string[],
      get sortedDeclaredTags() { return [...this.declaredTags].sort(); }
    },
    userSettingsStore: {Persist: vi.fn()}
  };

  const store = new StreamListStore(rootStore as any) as any;
  return {store, mockClient};
};

describe("StreamListStore tenant-query", () => {
  it("pages through every TenantContent page without rerouting the client's nodes", async () => {
    const tenantContent = vi.fn()
      .mockResolvedValueOnce({versions: [{id: "iq__1", hash: "hq__1"}], paging: {more: true}})
      .mockResolvedValueOnce({versions: [{id: "iq__2", hash: "hq__2"}], paging: {more: false}});
    const {store, mockClient} = makeStore({tenantContent});

    // Non-paged load pages through everything in one call.
    const content = await store.LoadTenantLiveStreamContent({siteId: "iq__site"});

    expect(tenantContent).toHaveBeenCalledTimes(2);
    expect(Object.keys(content)).toEqual(["iq__1", "iq__2"]);
    expect(mockClient.SetNodes).not.toHaveBeenCalled();
    expect(mockClient.ResetRegion).not.toHaveBeenCalled();
  });

  it("resolves with empty content and clears loading when TenantContent throws", async () => {
    const {store} = makeStore({tenantContent: vi.fn().mockRejectedValue(new Error("boom"))});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await store.LoadTenantLiveStreamContent({siteId: "iq__site"});
    errorSpy.mockRestore();

    expect(result).toEqual({});
    expect(store.loadingTenantLiveStreamContent).toBe(false);
  });

  it("passes the name search to the tenant query as a name:co: filter", async () => {
    const tenantContent = vi.fn().mockResolvedValue({versions: [], paging: {more: false}});
    const {store} = makeStore({tenantContent});

    await store.LoadTenantLiveStreamContent({siteId: "iq__site", nameFilter: ["  Final Match  "]});

    expect(tenantContent).toHaveBeenCalledWith(expect.objectContaining({
      filter: ["group:eq:iq__site", "name:co:Final Match"]
    }));
  });

  it("omits the name filter when the search is blank and carries it into load-more", async () => {
    const tenantContent = vi.fn().mockResolvedValue({versions: [], paging: {more: true}});
    const {store} = makeStore({tenantContent});

    await store.LoadTenantLiveStreamContent({siteId: "iq__site", nameFilter: ["quarterfinal"], paged: true});
    expect(tenantContent).toHaveBeenLastCalledWith(expect.objectContaining({filter: ["group:eq:iq__site", "name:co:quarterfinal"]}));

    await store.LoadMoreTenantLiveStreamContent();
    expect(tenantContent).toHaveBeenLastCalledWith(expect.objectContaining({filter: ["group:eq:iq__site", "name:co:quarterfinal"]}));
  });

  it("skips the radio-stream merge query when the request isn't date-scoped", async () => {
    const tenantContent = vi.fn().mockResolvedValue({versions: [{id: "iq__1", hash: "hq__1"}], paging: {more: false}});
    const {store} = makeStore({tenantContent});

    await store.LoadTenantLiveStreamContent({siteId: "iq__site"});

    expect(tenantContent).toHaveBeenCalledTimes(1);
  });
});

describe("StreamListStore.filteredStreams", () => {
  const streams = {
    a: {slug: "a", objectId: "iq__a", title: "Alpha", tags: ["x"]},
    b: {slug: "b", objectId: "iq__b", title: "Beta", tags: ["y"]}
  };

  it("applies the text filter client-side on the legacy path", () => {
    const {store} = makeStore({streams});
    store.rootStore.settingsStore.useContentGroup = false;
    store.SetTableFilter("alph");

    expect(store.filteredStreams.map((s: any) => s.slug)).toEqual(["a"]);
  });

  it("applies the text filter client-side on the content-group path", () => {
    const {store} = makeStore({streams});
    store.rootStore.settingsStore.useContentGroup = true;
    store.SetTableFilter("alph");

    expect(store.filteredStreams.map((s: any) => s.slug)).toEqual(["a"]);
  });

  it("matches metadata tags in the text filter", () => {
    const {store} = makeStore({streams});
    store.rootStore.settingsStore.useContentGroup = true;
    store.SetTableFilter("Y");

    expect(store.filteredStreams.map((s: any) => s.slug)).toEqual(["b"]);
    expect(store.searchNeedsFullLoad).toBe(true);
  });

  it("filters by object id client-side even on the content-group path", () => {
    const {store} = makeStore({streams});
    store.rootStore.settingsStore.useContentGroup = true;
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

describe("StreamListStore declared tags (OR semantics)", () => {
  const streams = {
    r: {slug: "r", objectId: "iq__r", title: "Radio One", tags: []},
    f: {slug: "f", objectId: "iq__f", title: "Finals", tags: ["Finals"]},
    o: {slug: "o", objectId: "iq__o", title: "Other", tags: ["vip"]}
  };

  const makeTagStore = (tagFilter: string[]) => {
    const {store} = makeStore({streams});
    store.rootStore.settingsStore.useContentGroup = true;
    store.rootStore.settingsStore.declaredTags = ["RADIO", "Finals"];
    store.rootStore.settingsStore.loadedDeclaredTags = true;
    store.RestoreTableTagFilter(tagFilter);
    return store;
  };

  it("sends a lone RADIO tag to the tenant query as a name filter", () => {
    const store = makeTagStore(["RADIO"]);

    expect(store.tenantNameTerms).toEqual(["RADIO"]);
    expect(store.declaredTagsNeedFullLoad).toBe(false);
  });

  it("matches other declared tags client-side by metadata tag", () => {
    const store = makeTagStore(["Finals"]);

    expect(store.tenantNameTerms).toEqual([]);
    expect(store.filteredStreams.map((s: any) => s.slug)).toEqual(["f"]);
  });

  it("ORs RADIO with a metadata tag client-side over a full load", () => {
    const store = makeTagStore(["RADIO", "vip"]);

    expect(store.tenantNameTerms).toEqual([]);
    expect(store.declaredTagsNeedFullLoad).toBe(true);
    expect(store.filteredStreams.map((s: any) => s.slug)).toEqual(["r", "o"]);
  });
});

describe("StreamListStore.FetchStreamInfo", () => {
  it("returns a stream from the loaded maps without any reads", async () => {
    const {store, mockClient} = makeStore({streams: {iq__a: {slug: "a", objectId: "iq__a", originUrl: "srt://a"}}});

    const info = await store.FetchStreamInfo("iq__a");

    expect(info.originUrl).toBe("srt://a");
    expect(mockClient.ContentObjectMetadata).not.toHaveBeenCalled();
    expect(mockClient.TenantContent).not.toHaveBeenCalled();
  });

  it("reads only that object on a miss, without paging the tenant", async () => {
    const {store, mockClient} = makeStore({meta: {iq__x: {live_recording_config: {url: "srt://x"}}}});

    const info = await store.FetchStreamInfo("iq__x");

    expect(info.originUrl).toBe("srt://x");
    expect(mockClient.TenantContent).not.toHaveBeenCalled();
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(expect.objectContaining({objectId: "iq__x"}));
  });

  it("returns undefined when the object can't be read", async () => {
    const {store, mockClient} = makeStore();
    mockClient.ContentObjectMetadata.mockRejectedValue(new Error("not found"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await store.FetchStreamInfo("iq__missing")).toBeUndefined();
  });
});

describe("StreamListStore.SetStreams", () => {
  it("replaces streamStatusStore.streams and drops selections no longer listed", () => {
    const {store} = makeStore({streams: {a: {slug: "a"}, b: {slug: "b"}}});
    store.SetSelectedRecords([{slug: "a"}, {slug: "b"}]);

    store.SetStreams({streams: {a: {slug: "a"}}});

    expect(store.rootStore.streamStatusStore._ReplaceStreams).toHaveBeenCalledWith({streams: {a: {slug: "a"}}});
    expect(store.selectedRecords.map((r: any) => r.slug)).toEqual(["a"]);
  });

  it("invalidates the unscoped set so the next LoadAllStreams refetches", () => {
    const {store} = makeStore();
    store.allStreamsLoaded = true;

    store.SetStreams({streams: {}});

    expect(store.allStreamsLoaded).toBe(false);
  });
});

describe("StreamListStore._TenantQuery", () => {
  const range: [Date, Date] = [new Date(2026, 0, 1), new Date(2026, 0, 7)];

  it("scopes by date and pages when the site uses the date filter", () => {
    const {store} = makeStore();
    Object.assign(store.rootStore.tenantStore, {siteId: "iq__site"});
    store.rootStore.settingsStore.useDateFilter = true;
    store.dateRangeFilter = range;

    expect(store._TenantQuery()).toEqual({siteId: "iq__site", dateRange: range, nameFilter: [], paged: true});
  });

  it("loads the full unpaged set for an object-id search", () => {
    const {store} = makeStore();
    Object.assign(store.rootStore.tenantStore, {siteId: "iq__site"});
    store.rootStore.settingsStore.useDateFilter = true;
    store.dateRangeFilter = range;
    store.SetTableFilter("iq__abc");

    expect(store._TenantQuery()).toEqual({siteId: "iq__site", dateRange: [null, null], nameFilter: [], paged: false});
  });

  it("drops scoping, name terms and paging when unscoped", () => {
    const {store} = makeStore();
    Object.assign(store.rootStore.tenantStore, {siteId: "iq__site"});
    store.rootStore.settingsStore.useDateFilter = true;
    store.dateRangeFilter = range;

    expect(store._TenantQuery({scoped: false})).toEqual({siteId: "iq__site", dateRange: [null, null], nameFilter: [], paged: false});
  });
});

describe("StreamListStore.LoadMappedStreams", () => {
  const streamMeta = {
    public: {name: "Mapped"},
    live_recording_config: {url: "srt://in"},
    live_recording: {fabric_config: {ingress_node_api: "https://node"}, playout_config: {}, recording_config: {}}
  };

  const setup = ({useContentGroup, siteLinks = {}}: {useContentGroup: boolean, siteLinks?: Record<string, unknown>}) => {
    const {store, mockClient} = makeStore({meta: {iq__a: streamMeta, iq__b: streamMeta}});
    const client = mockClient as any;
    client.utils = {
      LimitedMap: async (_n: number, items: unknown[], fn: (item: unknown) => Promise<unknown>) => {
        for(const item of items) { await fn(item); }
      },
      DecodeVersionHash: (hash: string) => ({objectId: hash.replace("hq__", "iq__")})
    };
    client.ContentObjectMetadata.mockImplementation(({objectId}: {objectId: string}) =>
      Promise.resolve(objectId === "iq__site" ? siteLinks : streamMeta)
    );
    store.rootStore.settingsStore.useContentGroup = useContentGroup;
    store.rootStore.tenantStore = {siteId: "iq__site", siteLibraryId: "ilib-site"};
    return {store, client};
  };

  it("reads each distinct mapped object once and keys content-group streams by object id", async () => {
    const {store, client} = setup({useContentGroup: true});

    await store.LoadMappedStreams({objectIds: ["iq__a", "iq__a", "iq__b"]});

    expect(client.TenantContent).not.toHaveBeenCalled();
    expect(client.ContentObjectMetadata).toHaveBeenCalledTimes(2);
    const {streams} = store.rootStore.streamStatusStore;
    expect(Object.keys(streams).sort()).toEqual(["iq__a", "iq__b"]);
    expect(streams.iq__a).toEqual(expect.objectContaining({objectId: "iq__a", libraryId: "ilib-x", title: "Mapped"}));
    // Cached for the first status read, so the poller needs no extra metadata call.
    expect(streams.iq__a.queryMainMeta).toBeDefined();
    expect(store.streamsScope).toBe("mapped");
    expect(store.streamsLoaded).toBe(true);
  });

  it("keys legacy streams by their site live_streams slug, read without resolving links", async () => {
    const {store, client} = setup({
      useContentGroup: false,
      siteLinks: {"my-slug": {"/": "/qfab/hq__a/meta/public"}}
    });

    await store.LoadMappedStreams({objectIds: ["iq__a", "iq__b"]});

    expect(client.ContentObjectMetadata).toHaveBeenCalledWith(expect.objectContaining({
      objectId: "iq__site",
      metadataSubtree: "public/asset_metadata/live_streams"
    }));
    expect(client.ContentObjectMetadata.mock.calls.find(([args]: any[]) => args.objectId === "iq__site")[0].resolveLinks).toBeUndefined();
    expect(Object.keys(store.rootStore.streamStatusStore.streams).sort()).toEqual(["iq__b", "my-slug"]);
  });
});
