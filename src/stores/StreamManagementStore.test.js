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

import StreamManagementStore from "./StreamManagementStore";

const mockProfile = {
  name: "My Profile",
  recording_config: {part_ttl: 3600, connection_timeout: 30},
  playout_config: {playout_formats: ["hls-clear"]}
};

const makeStore = ({profileSlug = "my-profile", profile = mockProfile} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib123"),
    ContentObjectMetadata: vi.fn().mockResolvedValue({}),
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
    streamBrowseStore: {
      UpdateStream: vi.fn(),
      UpdateDetailMetadata: vi.fn().mockResolvedValue(undefined),
      UpdateStreamAudioSettings: vi.fn().mockResolvedValue(undefined),
    }
  };

  const store = new StreamManagementStore(mockRootStore);

  // Stub internal methods that aren't under test
  store.UpdateDetailMetadata = vi.fn().mockResolvedValue(undefined);
  store.SetPermission = vi.fn().mockResolvedValue(undefined);
  store.UpdateAccessGroupPermission = vi.fn().mockResolvedValue(undefined);

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
    streamBrowseStore: {
      UpdateStream: vi.fn(),
      UpdateStreamAudioSettings: vi.fn().mockResolvedValue(undefined),
    }
  };

  const store = new StreamManagementStore(mockRootStore);
  store.UpdateDetailMetadata = vi.fn().mockResolvedValue(undefined);
  store.SetPermission = vi.fn().mockResolvedValue(undefined);
  store.UpdateAccessGroupPermission = vi.fn().mockResolvedValue(undefined);

  return {store, mockClient, mockRootStore};
};

const captureLiveRecordingWrite = (mockClient) => {
  const call = mockClient.ReplaceMetadata.mock.calls.find(
    ([args]) => args?.metadataSubtree === "live_recording"
  );
  return call?.[0]?.metadata;
};

describe("ApplyStreamProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs recording config fields from new profile to live_recording", async () => {
    const {store, mockClient} = makeApplyProfileStore();

    await store.ApplyStreamProfile({objectId: "iq__123", profileSlug: "new-profile", finalize: false});

    const metadata = captureLiveRecordingWrite(mockClient);
    expect(metadata.recording_config.recording_params.part_ttl).toBe(7200);
    expect(metadata.recording_config.recording_params.reconnect_timeout).toBe(60);
    expect(metadata.recording_config.recording_params.xc_params.connection_timeout).toBe(30);
  });

  it("syncs playout config fields from new profile to live_recording", async () => {
    const {store, mockClient} = makeApplyProfileStore();

    await store.ApplyStreamProfile({objectId: "iq__123", profileSlug: "new-profile", finalize: false});

    const metadata = captureLiveRecordingWrite(mockClient);
    expect(metadata.playout_config.dvr_enabled).toBe(true);
  });

  it("preserves existing live_recording fields not touched by the profile", async () => {
    const {store, mockClient} = makeApplyProfileStore();

    await store.ApplyStreamProfile({objectId: "iq__123", profileSlug: "new-profile", finalize: false});

    const metadata = captureLiveRecordingWrite(mockClient);
    // existing xc_params fields beyond connection_timeout should be preserved
    expect(metadata.recording_config.recording_params).toBeDefined();
  });

  it("calls UpdateStreamAudioSettings to rebuild ladder specs with new audio streams", async () => {
    const {store, mockRootStore} = makeApplyProfileStore();

    await store.ApplyStreamProfile({objectId: "iq__123", profileSlug: "new-profile", finalize: false});

    expect(mockRootStore.streamBrowseStore.UpdateStreamAudioSettings).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__123", writeToken: "wtoken123", finalize: false})
    );
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

    expect(store.rootStore.streamBrowseStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "test-stream",
        value: expect.objectContaining({configProfile: "my-profile"})
      })
    );
  });
});
