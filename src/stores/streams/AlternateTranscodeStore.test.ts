import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val) => val
}));

vi.mock("@/stores", () => ({}));

const configMetaSpy = vi.hoisted(() => vi.fn());
vi.mock("@/stores/lib/liveRecordingConfig", () => ({WriteLiveRecordingConfig: configMetaSpy}));

import AlternateTranscodeStore from "@/stores/streams/AlternateTranscodeStore";

describe("SaveAlternateTranscode", () => {
  const params = {
    objectId: "iq__alt", libraryId: "ilib1", name: "Alt", nodeType: "dedicated" as const,
    node: "inod1", protocol: "mpegts"
  };

  const makeAltStore = () => {
    configMetaSpy.mockReset().mockResolvedValue(undefined);
    const mockClient = {
      EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-alt"}),
      ContentObjectMetadata: vi.fn().mockResolvedValue(null),
      MergeMetadata: vi.fn().mockResolvedValue(undefined),
      DeleteWriteToken: vi.fn().mockResolvedValue(undefined)
    };
    const store = new AlternateTranscodeStore({client: mockClient, tenantStore: {}} as any) as any;
    return {store, mockClient, configMetaSpy};
  };

  it("discards the write token when a step after EditContentObject fails", async () => {
    const {store, mockClient} = makeAltStore();
    mockClient.MergeMetadata.mockRejectedValue(new Error("merge failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(store.SaveAlternateTranscode(params)).rejects.toThrow("merge failed");
    expect(mockClient.DeleteWriteToken).toHaveBeenCalledWith({writeToken: "wt-alt"});
  });

  it("does not discard the write token on success", async () => {
    const {store, mockClient} = makeAltStore();
    await store.SaveAlternateTranscode(params);
    expect(mockClient.DeleteWriteToken).not.toHaveBeenCalled();
  });
});

describe("CreateAlternateTranscode cleanup", () => {
  const params = {
    parentObjectId: "iq__parent", parentLibraryId: "ilib1",
    name: "Alt", nodeType: "dedicated" as const, node: "inod1", protocol: "mpegts"
  };

  const makeCreateStore = ({parentIds = [] as string[]} = {}) => {
    configMetaSpy.mockReset().mockResolvedValue(undefined);
    const mockClient = {
      CreateContentObject: vi.fn().mockResolvedValue({id: "iq__alt", writeToken: "wt-create"}),
      FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
      ContentObjectMetadata: vi.fn().mockImplementation(() => Promise.resolve({alternate_transcodes: parentIds})),
      StreamCreate: vi.fn().mockResolvedValue(undefined),
      EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-node"}),
      MergeMetadata: vi.fn().mockResolvedValue(undefined),
      DeleteWriteToken: vi.fn().mockResolvedValue(undefined),
      DeleteContentObject: vi.fn().mockResolvedValue(undefined),
      CreateSignedToken: vi.fn().mockResolvedValue("aessjc-token")
    };
    const store = new AlternateTranscodeStore({
      client: mockClient,
      tenantStore: {LoadTenantSiteData: vi.fn().mockResolvedValue({contentTypes: {}})}
    } as any) as any;
    return {store, mockClient, configMetaSpy};
  };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("deletes the reserved object when StreamCreate fails", async () => {
    const {store, mockClient} = makeCreateStore();
    mockClient.StreamCreate.mockRejectedValue(new Error("create failed"));

    await expect(store.CreateAlternateTranscode(params)).rejects.toThrow("create failed");
    expect(mockClient.DeleteContentObject).toHaveBeenCalledWith({libraryId: "ilib1", objectId: "iq__alt"});
  });

  it("discards the node write token and deletes the object when the node merge fails", async () => {
    const {store, mockClient} = makeCreateStore();
    mockClient.MergeMetadata.mockRejectedValue(new Error("merge failed"));

    await expect(store.CreateAlternateTranscode(params)).rejects.toThrow("merge failed");
    expect(mockClient.DeleteWriteToken).toHaveBeenCalledWith({writeToken: "wt-node"});
    expect(mockClient.DeleteContentObject).toHaveBeenCalled();
  });

  it("deletes the object when appending to the parent fails", async () => {
    const {store, mockClient, configMetaSpy} = makeCreateStore();
    configMetaSpy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("append failed"));

    await expect(store.CreateAlternateTranscode(params)).rejects.toThrow("append failed");
    expect(mockClient.DeleteContentObject).toHaveBeenCalledWith({libraryId: "ilib1", objectId: "iq__alt"});
  });

  it("keeps the object if the parent already references it", async () => {
    const {store, mockClient, configMetaSpy} = makeCreateStore({parentIds: ["iq__alt"]});
    configMetaSpy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("finalize timed out"));

    await expect(store.CreateAlternateTranscode(params)).rejects.toThrow("finalize timed out");
    expect(mockClient.DeleteContentObject).not.toHaveBeenCalled();
  });

  it("does not delete anything on success", async () => {
    const {store, mockClient} = makeCreateStore();
    await store.CreateAlternateTranscode(params);
    expect(mockClient.DeleteContentObject).not.toHaveBeenCalled();
    expect(mockClient.DeleteWriteToken).not.toHaveBeenCalled();
  });
});
