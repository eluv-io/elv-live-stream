import {describe, it, expect, vi, beforeEach} from "vitest";

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

import StreamEditStore from "./StreamEditStore";

const mockProfile = {
  name: "My Profile",
  recording_config: {part_ttl: 3600, connection_timeout: 30},
  playout_config: {playout_formats: ["hls-clear"]}
};

const makeStore = ({profileSlug = "my-profile", profile = mockProfile} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib123"),
    ContentObjectMetadata: vi.fn().mockResolvedValue(null),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wtoken123"}),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
    MergeMetadata: vi.fn().mockResolvedValue(undefined),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    StreamApplyProfile: vi.fn().mockResolvedValue({siteWriteToken: "site-wtoken"}),
  };

  const mockRootStore = {
    client: mockClient,
    dataStore: {siteId: "site123", siteLibraryId: "ilib-site"},
    profileStore: {
      profiles: {[profileSlug]: profile}
    },
    streamStore: {
      UpdateStream: vi.fn(),
      UpdateDetailMetadata: vi.fn().mockResolvedValue(undefined),
    }
  };

  const store = new StreamEditStore(mockRootStore);

  // Stub internal methods that aren't under test.
  // Note: MobX marks flow class fields as configurable:false, so Object.defineProperty
  // cannot be used. Direct assignment works for the call-interception side; we avoid
  // asserting on store.<method> directly and use the captured spy ref instead.
  store.UpdateDetailMetadata = vi.fn().mockResolvedValue(undefined);
  store.SetPermission = vi.fn().mockResolvedValue(undefined);
  store.UpdateAccessGroupPermission = vi.fn().mockResolvedValue(undefined);
  // UpdateStreamAudioSettings runs when probeCleared is falsy. With ContentObjectMetadata
  // returning null everywhere, the fallback path in UpdateStreamAudioSettings handles
  // null ladder_specs gracefully — no additional stub needed.

  return {store, mockClient};
};

// Existing live_recording before profile is applied (stream was configured with input_stream_info only)
const mockExistingLiveRecording = {
  playout_config: {
    dvr_enabled: false,
    playout_formats: ["hls-clear"]
  },
  recording_config: {
    recording_params: {
      part_ttl: 86400,
      reconnect_timeout: 10,
      xc_params: {connection_timeout: 5}
    }
  }
};

// live_recording_config after StreamApplyProfile writes the new profile
const mockLiveRecordingConfigAfterApply = {
  playout_config: {
    dvr: true,
    dvr_max_duration: 3600,
    playout_formats: ["hls-clear", "hls-aes128"],
    simple_watermark: null,
    image_watermark: null,
    forensic_watermark: null
  },
  recording_config: {
    connection_timeout: 30,
    part_ttl: 7200,
    reconnect_timeout: 60
  },
  recording_stream_config: {
    audio: {
      0: {bitrate: 128000, codec: "aac", playout: true, record: true, recording_channels: 2},
      1: {bitrate: 192000, codec: "aac", playout: true, record: true, recording_channels: 6}
    }
  }
};

const makeApplyProfileStore = () => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib123"),
    ContentObjectMetadata: vi.fn().mockImplementation(({metadataSubtree}) => {
      // With writeToken: new profile values already written by StreamApplyProfile
      if(metadataSubtree === "live_recording_config") return Promise.resolve(mockLiveRecordingConfigAfterApply);
      if(metadataSubtree === "live_recording") return Promise.resolve(mockExistingLiveRecording);
      return Promise.resolve(null);
    }),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wtoken123"}),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
    MergeMetadata: vi.fn().mockResolvedValue(undefined),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    StreamApplyProfile: vi.fn().mockResolvedValue({}),
  };

  const mockRootStore = {
    client: mockClient,
    dataStore: {siteId: "site123", siteLibraryId: "ilib-site"},
    profileStore: {
      profiles: {
        "new-profile": {
          name: "New Profile",
          recording_config: {part_ttl: 7200, connection_timeout: 30, reconnect_timeout: 60},
          playout_config: {dvr: true, dvr_max_duration: 3600, playout_formats: ["hls-clear", "hls-aes128"]},
          recording_stream_config: {
            audio: {
              0: {bitrate: 128000, codec: "aac", playout: true, record: true, recording_channels: 2},
              1: {bitrate: 192000, codec: "aac", playout: true, record: true, recording_channels: 6}
            }
          }
        }
      }
    },
    streamStore: {
      UpdateStream: vi.fn(),
    }
  };

  const store = new StreamEditStore(mockRootStore);
  store.UpdateDetailMetadata = vi.fn().mockResolvedValue(undefined);
  store.SetPermission = vi.fn().mockResolvedValue(undefined);
  store.UpdateAccessGroupPermission = vi.fn().mockResolvedValue(undefined);

  // Direct assignment installs the spy for call-interception purposes.
  // MobX's configurable:false prevents Object.defineProperty, but writable:true
  // allows plain assignment. Reading store.UpdateStreamAudioSettings goes through
  // MobX's observable proxy and returns the original — so always use this captured
  // reference for spy assertions, never `store.UpdateStreamAudioSettings`.
  const updateAudioSpy = vi.fn().mockResolvedValue(undefined);
  store.UpdateStreamAudioSettings = updateAudioSpy;

  return {store, mockClient, mockRootStore, updateAudioSpy};
};

describe("ApplyStreamProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call client.StreamApplyProfile with the profile object and stream write token", async () => {
    const {store, mockClient} = makeApplyProfileStore();

    await store.ApplyStreamProfile({objectId: "iq__123", profileSlug: "new-profile", finalize: false});

    expect(mockClient.StreamApplyProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "iq__123",
        streamWriteToken: "wtoken123",
        finalize: false,
        profile: expect.objectContaining({name: "New Profile"})
      })
    );
  });

  it("should call UpdateStreamAudioSettings when probeCleared is falsy", async () => {
    const {store, mockClient, updateAudioSpy} = makeApplyProfileStore();
    // probeCleared not set → UpdateStreamAudioSettings must be invoked
    mockClient.StreamApplyProfile.mockResolvedValue({});

    await store.ApplyStreamProfile({objectId: "iq__123", profileSlug: "new-profile", finalize: false});

    // Use the captured spy reference — reading store.UpdateStreamAudioSettings goes
    // through MobX's proxy and returns the original unwrapped flow, not the spy.
    expect(updateAudioSpy).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__123", writeToken: "wtoken123", finalize: false})
    );
  });

  it("should not call UpdateStreamAudioSettings when probeCleared is true", async () => {
    const {store, mockClient, updateAudioSpy} = makeApplyProfileStore();
    mockClient.StreamApplyProfile.mockResolvedValue({probeCleared: true});

    await store.ApplyStreamProfile({objectId: "iq__123", profileSlug: "new-profile", finalize: false});

    expect(updateAudioSpy).not.toHaveBeenCalled();
  });

  it("should return the response from client.StreamApplyProfile", async () => {
    const {store, mockClient} = makeApplyProfileStore();
    mockClient.StreamApplyProfile.mockResolvedValue({probeCleared: true, siteWriteToken: "site-abc"});

    const result = await store.ApplyStreamProfile({objectId: "iq__123", profileSlug: "new-profile", finalize: false});

    expect(result).toEqual({probeCleared: true, siteWriteToken: "site-abc"});
  });
});

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

    expect(store.rootStore.streamStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "test-stream",
        value: expect.objectContaining({configProfile: "my-profile"})
      })
    );
  });
});
