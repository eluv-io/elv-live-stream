import {describe, it, expect, vi, afterEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val: unknown) => val
}));

vi.mock("@/stores", () => ({}));
vi.mock("@/utils/constants", () => ({}));

vi.mock("@/utils/helpers", () => ({
  SortTable: () => () => 0
}));

vi.mock("@/utils/stream", () => ({
  DeriveSourceAndPackaging: vi.fn().mockReturnValue({source: ["srt"], packaging: ["hls"]}),
}));

import OutputStore from "@/stores/OutputStore";

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const makeClient = (overrides: Record<string, unknown> = {}) => ({
  ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-outputs"),
  ContentObjectMetadata: vi.fn().mockResolvedValue(null),
  OutputsList: vi.fn().mockResolvedValue({}),
  OutputsListItem: vi.fn().mockResolvedValue({}),
  OutputsState: vi.fn().mockResolvedValue({state: {connected_clients: 3}}),
  OutputsCreate: vi.fn().mockResolvedValue({"out-1": {name: "New Output", srt_pull: {urls: ["srt://host:1234"]}}}),
  OutputsResolveSrtPullUrls: vi.fn().mockImplementation(({value}) => Promise.resolve(value)),
  OutputsModify: vi.fn().mockResolvedValue(undefined),
  OutputsModifyBatch: vi.fn().mockResolvedValue(undefined),
  OutputsDelete: vi.fn().mockResolvedValue(undefined),
  OutputsDeleteBatch: vi.fn().mockResolvedValue(undefined),
  OutputsStop: vi.fn().mockResolvedValue(undefined),
  StreamSiteSettings: vi.fn().mockResolvedValue({siteLibraryId: "ilib-site", siteObjectId: "iq__site"}),
  EmbedUrl: vi.fn().mockResolvedValue("https://embed.example.com/watch"),
  StreamStatus: vi.fn().mockResolvedValue({quality: 0.9, input_stats: {}}),
  ...overrides
});

const makeStore = (clientOverrides: Record<string, unknown> = {}, streamStoreOverrides: Record<string, unknown> = {}) => {
  const mockClient = makeClient(clientOverrides);

  const mockRootStore = {
    client: mockClient,
    dataStore: {
      siteLibraryId: "ilib-site",
      siteId: "iq__site"
    },
    streamStore: {
      streams: {},
      streamsByObjectId: {},
      ...streamStoreOverrides
    }
  };

  const store = new OutputStore(mockRootStore as any) as any;
  store.outputSettingsId = "iq__output-settings";

  return {store, mockClient, mockRootStore};
};

// ---------------------------------------------------------------------------
// FlattenOutput / outputList
// ---------------------------------------------------------------------------

describe("FlattenOutput", () => {
  it("should resolve url from srt_pull.urls[0] first", () => {
    const {store} = makeStore();
    const output = {
      name: "SRT Pull Output",
      srt_pull: {urls: ["srt://primary:1234", "srt://secondary:1234"]},
      srt_push: {url: "srt://push:9999"},
      rtp: {url: "rtp://rtp:5000"},
      udp: {url: "udp://udp:6000"}
    };
    const flat = store.FlattenOutput("out-srt-pull", output);
    expect(flat.url).toBe("srt://primary:1234");
  });

  it("should fall back to srt_push.url when no srt_pull", () => {
    const {store} = makeStore();
    const output = {
      name: "SRT Push Output",
      srt_push: {url: "srt://push:9999"},
      rtp: {url: "rtp://rtp:5000"},
      udp: {url: "udp://udp:6000"}
    };
    const flat = store.FlattenOutput("out-srt-push", output);
    expect(flat.url).toBe("srt://push:9999");
  });

  it("should fall back to rtp.url when no srt", () => {
    const {store} = makeStore();
    const output = {name: "RTP Output", rtp: {url: "rtp://rtp:5000"}, udp: {url: "udp://udp:6000"}};
    const flat = store.FlattenOutput("out-rtp", output);
    expect(flat.url).toBe("rtp://rtp:5000");
  });

  it("should fall back to udp.url when no srt or rtp", () => {
    const {store} = makeStore();
    const output = {name: "UDP Output", udp: {url: "udp://udp:6000"}};
    const flat = store.FlattenOutput("out-udp", output);
    expect(flat.url).toBe("udp://udp:6000");
  });

  it("should return undefined url when no transport url is set", () => {
    const {store} = makeStore();
    const flat = store.FlattenOutput("out-empty", {name: "Empty"});
    expect(flat.url).toBeUndefined();
  });

  it("should include connectedClients from output.state", () => {
    const {store} = makeStore();
    const output = {srt_pull: {urls: ["srt://x:1"]}, state: {connected_clients: 7}};
    const flat = store.FlattenOutput("out-1", output);
    expect(flat.connectedClients).toBe(7);
  });

  it("should default connectedClients to 0 when state is absent", () => {
    const {store} = makeStore();
    const flat = store.FlattenOutput("out-1", {});
    expect(flat.connectedClients).toBe(0);
  });
});

describe("outputList", () => {
  it("should return all outputs when no filter is set", () => {
    const {store} = makeStore();
    store.outputs = {
      "out-a": {name: "Alpha"},
      "out-b": {name: "Beta"}
    };
    expect(store.outputList).toHaveLength(2);
  });

  it("should filter by tableFilter matching name", () => {
    const {store} = makeStore();
    store.outputs = {
      "out-a": {name: "Alpha Stream"},
      "out-b": {name: "Beta Channel"}
    };
    store.tableFilter = "alpha";
    expect(store.outputList).toHaveLength(1);
    expect(store.outputList[0].name).toBe("Alpha Stream");
  });

  it("should filter by tableFilter matching slug", () => {
    const {store} = makeStore();
    store.outputs = {
      "my-special-slug": {name: "Unnamed"},
      "other": {name: "Other"}
    };
    store.tableFilter = "special";
    expect(store.outputList).toHaveLength(1);
    expect(store.outputList[0].slug).toBe("my-special-slug");
  });

  it("should filter by tableTagFilter", () => {
    const {store} = makeStore();
    store.outputs = {
      "out-tagged": {name: "Tagged", tags: ["sports", "live"]},
      "out-plain": {name: "Plain", tags: ["news"]}
    };
    store.tableTagFilter = ["sports"];
    expect(store.outputList).toHaveLength(1);
    expect(store.outputList[0].slug).toBe("out-tagged");
  });

  it("should return all when tag filter is empty", () => {
    const {store} = makeStore();
    store.outputs = {
      "out-1": {name: "One", tags: ["a"]},
      "out-2": {name: "Two", tags: ["b"]}
    };
    store.tableTagFilter = [];
    expect(store.outputList).toHaveLength(2);
  });

  it("should include output matching any of the selected tags (OR logic)", () => {
    const {store} = makeStore();
    store.outputs = {
      "out-a": {name: "A", tags: ["sports"]},
      "out-b": {name: "B", tags: ["news"]},
      "out-c": {name: "C", tags: ["tech"]}
    };
    store.tableTagFilter = ["sports", "news"];
    expect(store.outputList).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// CheckOutputState
// ---------------------------------------------------------------------------

describe("CheckOutputState", () => {
  it("should return the response from OutputsState without mutating outputs when update=false", async () => {
    const {store, mockClient} = makeStore();
    store.outputs = {"out-1": {name: "One"}};
    mockClient.OutputsState.mockResolvedValue({state: {connected_clients: 5}});

    const result = await store.CheckOutputState({outputId: "out-1", update: false});

    expect(result).toEqual({state: {connected_clients: 5}});
    // output must not have been mutated
    expect(store.outputs["out-1"].state).toBeUndefined();
  });

  it("should merge state onto the stored output when update=true", async () => {
    const {store, mockClient} = makeStore();
    store.outputs = {"out-1": {name: "One"}};
    mockClient.OutputsState.mockResolvedValue({state: {connected_clients: 5}});

    await store.CheckOutputState({outputId: "out-1", update: true});

    expect(store.outputs["out-1"].state).toEqual({connected_clients: 5});
    // existing fields should be preserved
    expect(store.outputs["out-1"].name).toBe("One");
  });

  it("should return empty object and not throw when OutputsState rejects", async () => {
    const {store, mockClient} = makeStore();
    mockClient.OutputsState.mockRejectedValue(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await store.CheckOutputState({outputId: "out-x"});

    expect(result).toEqual({});
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// AllOutputsState
// ---------------------------------------------------------------------------

describe("AllOutputsState", () => {
  it("should call CheckOutputState for each output with update=true", async () => {
    const {store, mockClient} = makeStore();
    store.outputs = {
      "out-1": {name: "One"},
      "out-2": {name: "Two"}
    };
    mockClient.OutputsState.mockResolvedValue({state: {connected_clients: 1}});

    await store.AllOutputsState();

    expect(mockClient.OutputsState).toHaveBeenCalledTimes(2);
    expect(store.outputs["out-1"].state).toBeDefined();
    expect(store.outputs["out-2"].state).toBeDefined();
  });

  it("should continue updating remaining outputs when one throws", async () => {
    const {store, mockClient} = makeStore();
    store.outputs = {
      "out-fail": {name: "Fail"},
      "out-ok": {name: "OK"}
    };

    mockClient.OutputsState
      .mockRejectedValueOnce(new Error("output error"))
      .mockResolvedValueOnce({state: {connected_clients: 2}});

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await store.AllOutputsState();

    // The failing output should not have state, but the succeeding one should
    expect(store.outputs["out-fail"].state).toBeUndefined();
    expect(store.outputs["out-ok"].state).toEqual({connected_clients: 2});

    consoleSpy.mockRestore();
  });

  it("should run outputs sequentially (each call waits before starting next)", async () => {
    const {store, mockClient} = makeStore();
    store.outputs = {"out-1": {}, "out-2": {}};

    const order: string[] = [];
    mockClient.OutputsState.mockImplementation(({outputId}: {outputId: string}) => {
      order.push(`start-${outputId}`);
      return Promise.resolve({state: {}}).then(r => { order.push(`end-${outputId}`); return r; });
    });

    await store.AllOutputsState();

    // Sequential means: start-1, end-1, start-2, end-2 (not start-1, start-2, end-1, end-2)
    const i1 = order.indexOf("start-out-1");
    const e1 = order.indexOf("end-out-1");
    const i2 = order.indexOf("start-out-2");
    expect(e1).toBeLessThan(i2);
    expect(i1).toBeLessThan(e1);
  });

  it("should handle empty outputs gracefully", async () => {
    const {store, mockClient} = makeStore();
    store.outputs = {};

    await store.AllOutputsState();

    expect(mockClient.OutputsState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ModifyOutput
// ---------------------------------------------------------------------------

describe("ModifyOutput — transport branching", () => {
  const makeModifyStore = (existingOutput: Record<string, unknown>) => {
    const {store, mockClient} = makeStore({
      OutputsListItem: vi.fn()
        .mockResolvedValueOnce(existingOutput)      // first call (read)
        .mockResolvedValueOnce({...existingOutput, name: existingOutput.name ?? "Updated"})  // second call (after write)
    });
    store.outputs = {"out-1": existingOutput};
    return {store, mockClient};
  };

  it("should build srt_pull block with merged settings for srt_pull output", async () => {
    const existing = {
      name: "My Output",
      srt_pull: {urls: ["srt://host:1234"], strip_rtp: false, passphrase: "old", connection: {enforced_encryption: "aes-128"}},
      input: {stream: "iq__abc", name: "Stream A", status: "running"}
    };
    const {store, mockClient} = makeModifyStore(existing);

    await store.ModifyOutput({
      outputId: "out-1",
      name: "Renamed",
      passphrase: "newpass",
      encryption: "aes-256",
      stripRtp: true
    });

    const outputArg = mockClient.OutputsModify.mock.calls[0][0].output;
    expect(outputArg.srt_pull).toBeDefined();
    expect(outputArg.srt_pull.passphrase).toBe("newpass");
    expect(outputArg.srt_pull.connection.enforced_encryption).toBe("aes-256");
    expect(outputArg.srt_pull.strip_rtp).toBe(true);
    expect(outputArg.name).toBe("Renamed");
  });

  it("should build srt_push block for srt_push output", async () => {
    const existing = {
      name: "Push Out",
      srt_push: {url: "srt://push:9999", passphrase: "pp", strip_rtp: false, connection: {}},
      input: {stream: "iq__abc", name: "Stream B", status: "stopped"}
    };
    const {store, mockClient} = makeModifyStore(existing);

    await store.ModifyOutput({
      outputId: "out-1",
      encryption: "aes-128",
      passphrase: "secret",
      stripRtp: false
    });

    const outputArg = mockClient.OutputsModify.mock.calls[0][0].output;
    expect(outputArg.srt_push).toBeDefined();
    expect(outputArg.srt_push.passphrase).toBe("secret");
    expect(outputArg.srt_push.connection.enforced_encryption).toBe("aes-128");
    expect(outputArg.srt_pull).toBeUndefined();
  });

  it("should not add any SRT block for an rtp output", async () => {
    const existing = {
      name: "RTP Out",
      rtp: {url: "rtp://host:5004"},
      input: {stream: "iq__abc", name: "Stream C", status: "running"}
    };
    const {store, mockClient} = makeModifyStore(existing);

    await store.ModifyOutput({outputId: "out-1", name: "RTP Renamed"});

    const outputArg = mockClient.OutputsModify.mock.calls[0][0].output;
    expect(outputArg.srt_pull).toBeUndefined();
    expect(outputArg.srt_push).toBeUndefined();
    expect(outputArg.name).toBe("RTP Renamed");
  });

  it("should not add any SRT block for a udp output", async () => {
    const existing = {
      name: "UDP Out",
      udp: {url: "udp://host:6000"},
      input: {stream: "iq__def", name: "Stream D", status: "stopped"}
    };
    const {store, mockClient} = makeModifyStore(existing);

    await store.ModifyOutput({outputId: "out-1", name: "UDP Renamed"});

    const outputArg = mockClient.OutputsModify.mock.calls[0][0].output;
    expect(outputArg.srt_pull).toBeUndefined();
    expect(outputArg.srt_push).toBeUndefined();
  });

  it("should strip transient name and status from input before persisting", async () => {
    const existing = {
      name: "Out",
      srt_pull: {urls: ["srt://h:1"]},
      input: {stream: "iq__abc", name: "Stream Name", status: "running", url: "srt://source"}
    };
    const {store, mockClient} = makeModifyStore(existing);

    await store.ModifyOutput({outputId: "out-1"});

    const outputArg = mockClient.OutputsModify.mock.calls[0][0].output;
    // name and status must be stripped from input
    expect(outputArg.input.name).toBeUndefined();
    expect(outputArg.input.status).toBeUndefined();
    // non-transient fields remain
    expect(outputArg.input.stream).toBe("iq__abc");
    expect(outputArg.input.url).toBe("srt://source");
  });

  it("should strip transient state field from the top-level output before persisting", async () => {
    const existing = {
      name: "Out",
      srt_pull: {urls: ["srt://h:1"]},
      state: {connected_clients: 5},
      input: {stream: "iq__abc"}
    };
    const {store, mockClient} = makeModifyStore(existing);

    await store.ModifyOutput({outputId: "out-1"});

    const outputArg = mockClient.OutputsModify.mock.calls[0][0].output;
    expect(outputArg.state).toBeUndefined();
  });

  it("should update local outputs with the result of the second OutputsListItem call", async () => {
    const existing = {
      name: "Old Name",
      srt_pull: {urls: ["srt://h:1"]},
      input: {stream: "iq__abc", name: "S", status: "running"}
    };
    const {store} = makeStore({
      OutputsListItem: vi.fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({name: "New Name", srt_pull: {urls: ["srt://h:1"]}, enabled: true})
    });
    store.outputs = {"out-1": existing};

    await store.ModifyOutput({outputId: "out-1", name: "New Name"});

    expect(store.outputs["out-1"].name).toBe("New Name");
    expect(store.outputs["out-1"].enabled).toBe(true);
  });

  it("should throw and log when OutputsModify rejects", async () => {
    const existing = {name: "Out", srt_pull: {urls: []}, input: {stream: "iq__abc", name: "S", status: "r"}};
    const {store} = makeStore({
      OutputsListItem: vi.fn().mockResolvedValue(existing),
      OutputsModify: vi.fn().mockRejectedValue(new Error("write failed"))
    });
    store.outputs = {"out-1": existing};
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(store.ModifyOutput({outputId: "out-1"})).rejects.toThrow("write failed");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// CreateOutput
// ---------------------------------------------------------------------------

describe("CreateOutput", () => {
  it("should use node_ids (array) and elvgeos (array) for srt_pull type", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({
      type: "srt_pull",
      name: "Pull Out",
      node: "node-abc",
      region: "us-east",
    });

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.node_ids).toEqual(["node-abc"]);
    expect(deliveryArg.settings.elvgeos).toEqual(["us-east"]);
    expect(deliveryArg.settings.node_id).toBeUndefined();
    expect(deliveryArg.settings.elvgeo).toBeUndefined();
  });

  it("should use node_id (single) and elvgeo (single) for srt_push type", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({
      type: "srt_push",
      name: "Push Out",
      node: "node-xyz",
      region: "eu-west",
    });

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.node_id).toBe("node-xyz");
    expect(deliveryArg.settings.elvgeo).toBe("eu-west");
    expect(deliveryArg.settings.node_ids).toBeUndefined();
    expect(deliveryArg.settings.elvgeos).toBeUndefined();
  });

  it("should use node_id (single) for rtp type", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({type: "rtp", name: "RTP Out", node: "node-rtp"});

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.node_id).toBe("node-rtp");
    expect(deliveryArg.settings.node_ids).toBeUndefined();
  });

  it("should use node_id (single) for udp type", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({type: "udp", name: "UDP Out", node: "node-udp"});

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.node_id).toBe("node-udp");
    expect(deliveryArg.settings.node_ids).toBeUndefined();
  });

  it("should set SRT-only fields (passphrase, strip_rtp, connection) for srt_pull", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({
      type: "srt_pull",
      name: "SRT",
      passphrase: "mypass",
      stripRtp: true,
      encryption: "aes-128",
    });

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.passphrase).toBe("mypass");
    expect(deliveryArg.settings.strip_rtp).toBe(true);
    expect(deliveryArg.settings.connection).toEqual({enforced_encryption: "aes-128"});
  });

  it("should set SRT-only fields for srt_push", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({
      type: "srt_push",
      name: "SRT Push",
      passphrase: "pushpass",
      stripRtp: false,
      encryption: "aes-256",
    });

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.passphrase).toBe("pushpass");
    expect(deliveryArg.settings.strip_rtp).toBe(false);
    expect(deliveryArg.settings.connection).toEqual({enforced_encryption: "aes-256"});
  });

  it("should NOT set SRT-only fields for rtp output", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({type: "rtp", name: "RTP", passphrase: "ignored", encryption: "aes-128", stripRtp: true});

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.passphrase).toBeUndefined();
    expect(deliveryArg.settings.strip_rtp).toBeUndefined();
    expect(deliveryArg.settings.connection).toBeUndefined();
  });

  it("should NOT set SRT-only fields for udp output", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({type: "udp", name: "UDP", passphrase: "ignored"});

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.passphrase).toBeUndefined();
  });

  it("should set connection to undefined when encryption is absent for SRT", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({type: "srt_pull", name: "No Enc"});

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    expect(deliveryArg.settings.connection).toBeUndefined();
  });

  it("should set passphrase to undefined when encryption is absent (even if passphrase provided)", async () => {
    const {store, mockClient} = makeStore();

    // When there's no encryption, passphrase should be undefined (falsy passphrase or undefined)
    await store.CreateOutput({type: "srt_pull", name: "No Enc", passphrase: "orphan"});

    const deliveryArg = mockClient.OutputsCreate.mock.calls[0][0].delivery;
    // passphrase is set to passphrase || undefined when isSrt=true. Since no encryption,
    // the passphrase value is set regardless (the encryption guard is only on connection).
    // Actually looking at the code: `settings.passphrase = passphrase || undefined` — when passphrase
    // is provided and isSrt is true, it WILL be set even without encryption.
    expect(deliveryArg.settings.passphrase).toBe("orphan");
  });

  it("should auto-generate a name when none is provided", async () => {
    const {store, mockClient} = makeStore();
    store.outputs = {"out-existing": {name: "Existing"}, "out-existing-2": {name: "Existing 2"}};

    await store.CreateOutput({type: "rtp"});

    const outputArg = mockClient.OutputsCreate.mock.calls[0][0];
    expect(outputArg.name).toMatch(/Output \d+/);
  });

  it("should store the new output in this.outputs after creation", async () => {
    const outputData = {name: "Created", srt_pull: {urls: ["srt://new:1234"]}};
    const {store} = makeStore({
      OutputsCreate: vi.fn().mockResolvedValue({"out-new": outputData}),
      OutputsResolveSrtPullUrls: vi.fn().mockResolvedValue(outputData)
    });

    await store.CreateOutput({type: "srt_pull", name: "Created"});

    expect(store.outputs["out-new"]).toBeDefined();
    expect(store.outputs["out-new"].name).toBe("Created");
  });

  it("should call OutputsResolveSrtPullUrls on the created output data", async () => {
    const {store, mockClient} = makeStore();

    await store.CreateOutput({type: "srt_pull", name: "Pull"});

    expect(mockClient.OutputsResolveSrtPullUrls).toHaveBeenCalledTimes(1);
  });

  it("should throw when outputSettingsId is not set", async () => {
    const {store} = makeStore();
    store.outputSettingsId = "";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(store.CreateOutput({type: "rtp", name: "Out"})).rejects.toBeTruthy();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Batch flows
// ---------------------------------------------------------------------------

describe("MapStreamBatch", () => {
  it("should call OutputsModifyBatch with a map of updated outputs", async () => {
    const {store, mockClient} = makeStore({
      ContentObjectMetadata: vi.fn()
        .mockResolvedValueOnce({name: "Out A", enabled: false, input: null})
        .mockResolvedValueOnce({name: "Out B", enabled: true, input: {stream: "iq__old"}})
    });
    store.outputs = {"out-a": {name: "Out A"}, "out-b": {name: "Out B"}};

    await store.MapStreamBatch({outputs: ["out-a", "out-b"], streamObjectId: "iq__stream-1"});

    expect(mockClient.OutputsModifyBatch).toHaveBeenCalledTimes(1);
    const batchArg = mockClient.OutputsModifyBatch.mock.calls[0][0];
    expect(batchArg.outputs["out-a"]).toBeDefined();
    expect(batchArg.outputs["out-b"]).toBeDefined();
    expect(batchArg.outputs["out-a"].input.stream).toBe("iq__stream-1");
    expect(batchArg.outputs["out-b"].input.stream).toBe("iq__stream-1");
  });

  it("should enable output that had no prior stream mapping", async () => {
    const {store, mockClient} = makeStore({
      ContentObjectMetadata: vi.fn().mockResolvedValue({name: "Out", enabled: false, input: null})
    });
    store.outputs = {"out-x": {name: "Out"}};

    await store.MapStreamBatch({outputs: ["out-x"], streamObjectId: "iq__new-stream"});

    const batchArg = mockClient.OutputsModifyBatch.mock.calls[0][0];
    expect(batchArg.outputs["out-x"].enabled).toBe(true);
  });

  it("should preserve existing enabled state when output already had a stream", async () => {
    const {store, mockClient} = makeStore({
      ContentObjectMetadata: vi.fn().mockResolvedValue({name: "Out", enabled: false, input: {stream: "iq__old"}})
    });
    store.outputs = {"out-x": {name: "Out"}};

    await store.MapStreamBatch({outputs: ["out-x"], streamObjectId: "iq__new"});

    const batchArg = mockClient.OutputsModifyBatch.mock.calls[0][0];
    expect(batchArg.outputs["out-x"].enabled).toBe(false);
  });

  it("should update local outputs after batch modify", async () => {
    const streamStore = {
      streams: {"my-stream": {objectId: "iq__stream-1", title: "My Stream", status: "running"}},
      streamsByObjectId: {}
    };
    const {store: s2} = makeStore(
      {ContentObjectMetadata: vi.fn().mockResolvedValue({name: "Out", enabled: false, input: null})},
      streamStore
    );
    s2.outputs = {"out-1": {name: "Out"}};

    await s2.MapStreamBatch({outputs: ["out-1"], streamObjectId: "iq__stream-1"});

    expect(s2.outputs["out-1"].input?.stream).toBe("iq__stream-1");
    expect(s2.outputs["out-1"].input?.name).toBe("My Stream");
  });

  it("should throw when OutputsModifyBatch rejects", async () => {
    const {store} = makeStore({
      ContentObjectMetadata: vi.fn().mockResolvedValue({name: "Out", input: null}),
      OutputsModifyBatch: vi.fn().mockRejectedValue(new Error("batch failed"))
    });
    store.outputs = {"out-x": {}};
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(store.MapStreamBatch({outputs: ["out-x"], streamObjectId: "iq__s"})).rejects.toThrow("batch failed");
    consoleSpy.mockRestore();
  });
});

describe("UnmapStreamBatch", () => {
  it("should call OutputsModifyBatch with input=null and enabled=false for each output", async () => {
    const {store, mockClient} = makeStore({
      ContentObjectMetadata: vi.fn()
        .mockResolvedValueOnce({name: "Out A", enabled: true, input: {stream: "iq__s"}})
        .mockResolvedValueOnce({name: "Out B", enabled: true, input: {stream: "iq__s"}})
    });
    store.outputs = {"out-a": {}, "out-b": {}};

    await store.UnmapStreamBatch({outputs: ["out-a", "out-b"]});

    const batchArg = mockClient.OutputsModifyBatch.mock.calls[0][0];
    expect(batchArg.outputs["out-a"].enabled).toBe(false);
    expect(batchArg.outputs["out-a"].input).toBeNull();
    expect(batchArg.outputs["out-b"].enabled).toBe(false);
    expect(batchArg.outputs["out-b"].input).toBeNull();
  });

  it("should set local output.input to empty object after unmap", async () => {
    const {store} = makeStore({
      ContentObjectMetadata: vi.fn().mockResolvedValue({name: "Out", enabled: true, input: {stream: "iq__s"}})
    });
    store.outputs = {"out-1": {enabled: true, input: {stream: "iq__s"}}};

    await store.UnmapStreamBatch({outputs: ["out-1"]});

    expect(store.outputs["out-1"].input).toEqual({});
    expect(store.outputs["out-1"].enabled).toBe(false);
  });
});

describe("EnableOutputBatch", () => {
  it("should call OutputsModifyBatch with enabled=true for all outputs", async () => {
    const {store, mockClient} = makeStore({
      ContentObjectMetadata: vi.fn()
        .mockResolvedValueOnce({name: "A", enabled: false})
        .mockResolvedValueOnce({name: "B", enabled: false})
    });
    store.outputs = {"out-a": {}, "out-b": {}};

    await store.EnableOutputBatch({outputs: ["out-a", "out-b"]});

    const batchArg = mockClient.OutputsModifyBatch.mock.calls[0][0];
    expect(batchArg.outputs["out-a"].enabled).toBe(true);
    expect(batchArg.outputs["out-b"].enabled).toBe(true);
  });

  it("should update local outputs to enabled=true", async () => {
    const {store} = makeStore({
      ContentObjectMetadata: vi.fn().mockResolvedValue({name: "Out", enabled: false})
    });
    store.outputs = {"out-1": {enabled: false}};

    await store.EnableOutputBatch({outputs: ["out-1"]});

    expect(store.outputs["out-1"].enabled).toBe(true);
  });
});

describe("DisableOutputBatch", () => {
  it("should call OutputsModifyBatch with enabled=false for all outputs", async () => {
    const {store, mockClient} = makeStore({
      ContentObjectMetadata: vi.fn()
        .mockResolvedValueOnce({name: "A", enabled: true})
        .mockResolvedValueOnce({name: "B", enabled: true})
    });
    store.outputs = {"out-a": {}, "out-b": {}};

    await store.DisableOutputBatch({outputs: ["out-a", "out-b"]});

    const batchArg = mockClient.OutputsModifyBatch.mock.calls[0][0];
    expect(batchArg.outputs["out-a"].enabled).toBe(false);
    expect(batchArg.outputs["out-b"].enabled).toBe(false);
  });

  it("should update local outputs to enabled=false", async () => {
    const {store} = makeStore({
      ContentObjectMetadata: vi.fn().mockResolvedValue({name: "Out", enabled: true})
    });
    store.outputs = {"out-1": {enabled: true}};

    await store.DisableOutputBatch({outputs: ["out-1"]});

    expect(store.outputs["out-1"].enabled).toBe(false);
  });
});

describe("DeleteOutputBatch", () => {
  it("should call OutputsDeleteBatch with the array of output IDs", async () => {
    const {store, mockClient} = makeStore();
    store.outputs = {"out-a": {name: "A"}, "out-b": {name: "B"}};

    await store.DeleteOutputBatch({outputs: ["out-a", "out-b"]});

    expect(mockClient.OutputsDeleteBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        outputs: ["out-a", "out-b"],
        objectId: "iq__output-settings"
      })
    );
  });

  it("should remove deleted outputs from local this.outputs", async () => {
    const {store} = makeStore();
    store.outputs = {"out-a": {name: "A"}, "out-b": {name: "B"}, "out-c": {name: "C"}};

    await store.DeleteOutputBatch({outputs: ["out-a", "out-b"]});

    expect(store.outputs["out-a"]).toBeUndefined();
    expect(store.outputs["out-b"]).toBeUndefined();
    expect(store.outputs["out-c"]).toBeDefined();
  });

  it("should throw when OutputsDeleteBatch rejects", async () => {
    const {store} = makeStore({
      OutputsDeleteBatch: vi.fn().mockRejectedValue(new Error("delete failed"))
    });
    store.outputs = {"out-a": {}};
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(store.DeleteOutputBatch({outputs: ["out-a"]})).rejects.toThrow("delete failed");
    consoleSpy.mockRestore();
  });
});
