import {describe, it, expect, vi} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
  toJS: (val) => val
}));

vi.mock("@/stores", () => ({}));

import ProfileStore from "@/stores/ProfileStore.ts";

const makeStore = ({siteId = "iq__site", siteLibraryId = "ilib-site", client = {}} = {}) => {
  const mockClient = {
    StreamConfigProfiles: vi.fn().mockResolvedValue({}),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-abc"}),
    DeleteFiles: vi.fn().mockResolvedValue(undefined),
    DeleteMetadata: vi.fn().mockResolvedValue(undefined),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
    StreamSaveConfigProfile: vi.fn().mockResolvedValue(undefined),
    ContentObjectMetadata: vi.fn().mockResolvedValue([]),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    ...client
  };
  const rootStore = {
    client: mockClient,
    dataStore: {siteId, siteLibraryId}
  };
  const store = new ProfileStore(rootStore);
  return {store, mockClient};
};

const profile = (name = "My Profile", extra = {}) => ({
  name,
  playout_config: {playout_formats: ["hls-clear"]},
  ...extra
});

describe("LoadProfiles", () => {
  it("sets state to loaded and populates profiles on success", async () => {
    const {store, mockClient} = makeStore();
    mockClient.StreamConfigProfiles.mockResolvedValue({"my-profile": profile()});
    await store.LoadProfiles();
    expect(store.state).toBe("loaded");
    expect(store.profiles["my-profile"].name).toBe("My Profile");
  });

  it("initializes drafts as shallow copies of profiles", async () => {
    const {store, mockClient} = makeStore();
    mockClient.StreamConfigProfiles.mockResolvedValue({"my-profile": profile()});
    await store.LoadProfiles();
    expect(store.drafts["my-profile"]).toEqual(store.profiles["my-profile"]);
    expect(store.drafts["my-profile"]).not.toBe(store.profiles["my-profile"]);
  });

  it("defaults to empty object when API returns null", async () => {
    const {store, mockClient} = makeStore();
    mockClient.StreamConfigProfiles.mockResolvedValue(null);
    await store.LoadProfiles();
    expect(store.state).toBe("loaded");
    expect(store.profiles).toEqual({});
    expect(store.drafts).toEqual({});
  });

  it("sets state to error when API throws", async () => {
    const {store, mockClient} = makeStore();
    mockClient.StreamConfigProfiles.mockRejectedValue(new Error("Network failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await store.LoadProfiles();
    consoleSpy.mockRestore();
    expect(store.state).toBe("error");
  });
});

describe("DeleteProfile", () => {
  it("removes unsaved draft without any API calls", async () => {
    const {store, mockClient} = makeStore();
    store.drafts["new-draft"] = profile("New Draft");
    await store.DeleteProfile("new-draft");
    expect(mockClient.EditContentObject).not.toHaveBeenCalled();
    expect(store.drafts["new-draft"]).toBeUndefined();
  });

  it("calls EditContentObject, DeleteFiles, DeleteMetadata, FinalizeContentObject for saved profile", async () => {
    const {store, mockClient} = makeStore();
    store.profiles["my-profile"] = profile();
    store.drafts["my-profile"] = profile();
    await store.DeleteProfile("my-profile");
    expect(mockClient.EditContentObject).toHaveBeenCalledWith({libraryId: "ilib-site", objectId: "iq__site"});
    expect(mockClient.DeleteFiles).toHaveBeenCalledWith(
      expect.objectContaining({filePaths: ["live_stream_profiles/my-profile.json"]})
    );
    expect(mockClient.DeleteMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "public/asset_metadata/profiles/my-profile"})
    );
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({commitMessage: "Delete config profile"})
    );
  });

  it("removes slug from both profiles and drafts after delete", async () => {
    const {store} = makeStore();
    store.profiles["my-profile"] = profile();
    store.drafts["my-profile"] = profile();
    await store.DeleteProfile("my-profile");
    expect(store.profiles["my-profile"]).toBeUndefined();
    expect(store.drafts["my-profile"]).toBeUndefined();
  });
});

describe("SaveProfiles", () => {
  it("throws when siteId is not configured", async () => {
    const {store} = makeStore({siteId: null});
    await expect(store.SaveProfiles()).rejects.toThrow("Tenant is not configured with a site ID");
  });

  it("skips StreamSaveConfigProfile for clean profiles", async () => {
    const {store, mockClient} = makeStore();
    const p = profile();
    store.profiles["my-profile"] = p;
    store.drafts["my-profile"] = {...p};
    await store.SaveProfiles();
    expect(mockClient.StreamSaveConfigProfile).not.toHaveBeenCalled();
  });

  it("calls StreamSaveConfigProfile for dirty profiles", async () => {
    const {store, mockClient} = makeStore();
    store.profiles["my-profile"] = profile("My Profile");
    store.drafts["my-profile"] = profile("My Profile", {recording_config: {part_ttl: 999}});
    await store.SaveProfiles();
    expect(mockClient.StreamSaveConfigProfile).toHaveBeenCalledWith(
      expect.objectContaining({finalize: false})
    );
  });

  it("calls FinalizeContentObject when at least one profile is dirty", async () => {
    const {store, mockClient} = makeStore();
    store.profiles["my-profile"] = profile("My Profile");
    store.drafts["my-profile"] = profile("My Profile", {recording_config: {part_ttl: 999}});
    await store.SaveProfiles();
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({commitMessage: "Update config profiles"})
    );
  });

  it("skips FinalizeContentObject when nothing is dirty", async () => {
    const {store, mockClient} = makeStore();
    const p = profile();
    store.profiles["my-profile"] = p;
    store.drafts["my-profile"] = {...p};
    await store.SaveProfiles();
    expect(mockClient.FinalizeContentObject).not.toHaveBeenCalled();
  });

  it("updates profiles in place when name and key are unchanged", async () => {
    const {store, mockClient} = makeStore();
    store.profiles["my-profile"] = profile("My Profile");
    store.drafts["my-profile"] = profile("My Profile", {recording_config: {part_ttl: 999}});
    await store.SaveProfiles();
    expect(store.profiles["my-profile"]).toBeDefined();
    expect(store.profiles["my-profile"].recording_config.part_ttl).toBe(999);
    expect(mockClient.DeleteFiles).not.toHaveBeenCalled();
  });

  it("saves new profile under newKey when draft name produces a different slug than draftKey", async () => {
    const {store} = makeStore();
    // draft key from AddDraft, but user renamed it before saving
    store.drafts["config-profile-1"] = profile("My New Profile");
    // not in profiles — it's brand new
    await store.SaveProfiles();
    expect(store.profiles["my-new-profile"]).toBeDefined();
    expect(store.profiles["config-profile-1"]).toBeUndefined();
    expect(store.drafts["my-new-profile"]).toBeDefined();
    expect(store.drafts["config-profile-1"]).toBeUndefined();
  });

  it("deletes old file and metadata when an existing profile is renamed", async () => {
    const {store, mockClient} = makeStore();
    store.profiles["old-name"] = profile("Old Name");
    store.drafts["old-name"] = profile("New Name");
    await store.SaveProfiles();
    expect(mockClient.DeleteFiles).toHaveBeenCalledWith(
      expect.objectContaining({filePaths: ["live_stream_profiles/old-name.json"]})
    );
    expect(mockClient.DeleteMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "public/asset_metadata/profiles/old-name"})
    );
  });

  it("migrates profile_streams to new key when streams are associated", async () => {
    const {store, mockClient} = makeStore({
      client: {ContentObjectMetadata: vi.fn().mockResolvedValue(["stream-id-1"])}
    });
    store.profiles["old-name"] = profile("Old Name");
    store.drafts["old-name"] = profile("New Name");
    await store.SaveProfiles();
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "public/asset_metadata/profile_streams/new-name"})
    );
    expect(mockClient.DeleteMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "public/asset_metadata/profile_streams/old-name"})
    );
  });

  it("skips ReplaceMetadata for profile_streams when no streams are associated", async () => {
    const {store, mockClient} = makeStore({
      client: {ContentObjectMetadata: vi.fn().mockResolvedValue([])}
    });
    store.profiles["old-name"] = profile("Old Name");
    store.drafts["old-name"] = profile("New Name");
    await store.SaveProfiles();
    expect(mockClient.ReplaceMetadata).not.toHaveBeenCalled();
  });

  it("moves profile to new key in state when existing profile is renamed", async () => {
    const {store} = makeStore();
    store.profiles["old-name"] = profile("Old Name");
    store.drafts["old-name"] = profile("New Name");
    await store.SaveProfiles();
    expect(store.profiles["new-name"]).toBeDefined();
    expect(store.profiles["old-name"]).toBeUndefined();
    expect(store.drafts["new-name"]).toBeDefined();
    expect(store.drafts["old-name"]).toBeUndefined();
  });
});
