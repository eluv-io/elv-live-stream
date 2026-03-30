import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  toJS: (val) => val
}));

import StreamManagementStore from "./StreamManagementStore";

const mockProfile = {
  name: "My Profile",
  recording_config: {part_ttl: 3600, connection_timeout: 30},
  playout_config: {playout_formats: ["hls-clear"]}
};

const makeStore = ({profileSlug = "my-profile", profile = mockProfile} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib123"),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wtoken123"}),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
    StreamApplyProfile: vi.fn().mockResolvedValue({siteWriteToken: "site-wtoken"}),
  };

  const store = new StreamManagementStore();
  store.client = mockClient;
  store.rootStore = {
    dataStore: {siteId: "site123", siteLibraryId: "ilib-site"},
    profileStore: {
      profiles: {[profileSlug]: profile}
    },
    streamBrowseStore: {
      UpdateStream: vi.fn(),
      UpdateDetailMetadata: vi.fn().mockResolvedValue(undefined)
    }
  };

  // Stub internal methods that aren't under test
  store.UpdateDetailMetadata = vi.fn().mockResolvedValue(undefined);
  store.SetPermission = vi.fn().mockResolvedValue(undefined);
  store.UpdateAccessGroupPermission = vi.fn().mockResolvedValue(undefined);

  return {store, mockClient};
};

describe("UpdateGeneralConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls StreamApplyProfile with the full profile object when configProfile is provided", async () => {
    const {store, mockClient} = makeStore();

    await store.UpdateGeneralConfig({
      objectId: "iq__123",
      slug: "test-stream",
      formData: {name: "Test", description: "", displayTitle: "", permission: "", accessGroup: "", url: ""},
      configProfile: "my-profile"
    });

    expect(mockClient.StreamApplyProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          name: "My Profile",
          recording_config: expect.objectContaining({part_ttl: 3600}),
          playout_config: expect.objectContaining({playout_formats: ["hls-clear"]})
        }),
        objectId: "iq__123"
      })
    );
  });

  it("finalizes the site object when StreamApplyProfile returns a siteWriteToken", async () => {
    const {store, mockClient} = makeStore();

    await store.UpdateGeneralConfig({
      objectId: "iq__123",
      slug: "test-stream",
      formData: {name: "Test", description: "", displayTitle: "", permission: "", accessGroup: "", url: ""},
      configProfile: "my-profile"
    });

    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "site123",
        writeToken: "site-wtoken"
      })
    );
  });

  it("does not call StreamApplyProfile when no configProfile is provided", async () => {
    const {store, mockClient} = makeStore();

    await store.UpdateGeneralConfig({
      objectId: "iq__123",
      slug: "test-stream",
      formData: {name: "Test", description: "", displayTitle: "", permission: "", accessGroup: "", url: ""}
    });

    expect(mockClient.StreamApplyProfile).not.toHaveBeenCalled();
  });

  it("updates the stream store with the new configProfile slug", async () => {
    const {store} = makeStore();

    await store.UpdateGeneralConfig({
      objectId: "iq__123",
      slug: "test-stream",
      formData: {name: "Test", description: "", displayTitle: "", permission: "", accessGroup: "", url: ""},
      configProfile: "my-profile"
    });

    expect(store.rootStore.streamBrowseStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "test-stream",
        value: expect.objectContaining({configProfile: "my-profile"})
      })
    );
  });
});