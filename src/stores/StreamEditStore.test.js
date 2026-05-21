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

const makeSyncStore = (metadataResponse = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("mock-lib-id"),
    ContentObjectMetadata: vi.fn().mockResolvedValue(metadataResponse)
  };
  const store = new StreamEditStore({client: mockClient, dataStore: {}, profileStore: {profiles: {}}, streamStore: {}});
  const updateAudioSpy = vi.fn().mockResolvedValue(undefined);
  store.UpdateStreamAudioSettings = updateAudioSpy;
  return {store, mockClient, updateAudioSpy};
};

const defaultLadderResult = {
  nAudio: 1,
  globalAudioBitrate: 128000,
  audioLadderSpecs: [{stream_name: "audio_0", stream_index: 0}],
  audioIndexMeta: [0, 0, 0, 0, 0, 0, 0, 0]
};

const makeUpdateAudioStore = ({ladderSpecs = null, xcParams = null} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("lib-1"),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "new-wtoken"}),
    ContentObjectMetadata: vi.fn().mockImplementation(({metadataSubtree}) => {
      if(metadataSubtree === "live_recording/recording_config/recording_params/ladder_specs") return Promise.resolve(ladderSpecs);
      if(metadataSubtree === "live_recording/recording_config/recording_params/xc_params") return Promise.resolve(xcParams);
      if(metadataSubtree === "live_recording_config/recording_stream_config/audio") return Promise.resolve(null);
      return Promise.resolve(null);
    }),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined)
  };
  const store = new StreamEditStore({client: mockClient, dataStore: {}, profileStore: {profiles: {}}, streamStore: {}});
  const updateLadderSpy = vi.fn().mockResolvedValue(defaultLadderResult);
  store.UpdateAudioLadderSpecs = updateLadderSpy;
  return {store, mockClient, updateLadderSpy};
};

describe("UpdateStreamAudioSettings", () => {
  it("opens a write token when none is provided", async () => {
    const {store, mockClient} = makeUpdateAudioStore();
    await store.UpdateStreamAudioSettings({objectId: "iq__1", audioData: {0: {record: true, bitrate: 128000}}});
    expect(mockClient.EditContentObject).toHaveBeenCalledWith({libraryId: "lib-1", objectId: "iq__1"});
  });

  it("skips EditContentObject when writeToken is already provided", async () => {
    const {store, mockClient} = makeUpdateAudioStore();
    await store.UpdateStreamAudioSettings({objectId: "iq__1", writeToken: "existing-wt", audioData: {0: {record: true, bitrate: 128000}}});
    expect(mockClient.EditContentObject).not.toHaveBeenCalled();
  });

  it("fetches audioData from metadata when not provided", async () => {
    const {store, mockClient} = makeUpdateAudioStore();
    mockClient.ContentObjectMetadata.mockImplementation(({metadataSubtree}) => {
      if(metadataSubtree === "live_recording_config/recording_stream_config/audio") {
        return Promise.resolve({0: {record: true, bitrate: 128000}});
      }
      return Promise.resolve(null);
    });
    await store.UpdateStreamAudioSettings({objectId: "iq__1", writeToken: "wt"});
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_config/recording_stream_config/audio"})
    );
  });

  it("falls back to ladder_specs path and returns early when audioData is empty", async () => {
    const ladderSpecs = [
      {stream_name: "audio_0", stream_index: 0, media_type: 2},
      {stream_name: "video_0", stream_index: 1, media_type: 1}
    ];
    const {store, mockClient} = makeUpdateAudioStore({ladderSpecs, xcParams: {n_audio: 0}});
    await store.UpdateStreamAudioSettings({objectId: "iq__1", writeToken: "wt", audioData: {}});

    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording/recording_config/recording_params/xc_params"})
    );
    // Should NOT write recording_stream_config/audio since it returned early
    expect(mockClient.ReplaceMetadata).not.toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_config/recording_stream_config/audio"})
    );
  });

  it("sets default=true on the single entry when audioData has exactly one key", async () => {
    const {store, mockClient} = makeUpdateAudioStore();
    await store.UpdateStreamAudioSettings({
      objectId: "iq__1",
      writeToken: "wt",
      audioData: {0: {record: true, bitrate: 128000}}
    });

    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataSubtree: "live_recording_config/recording_stream_config/audio",
        metadata: expect.objectContaining({0: expect.objectContaining({default: true})})
      })
    );
  });

  it("does not set default on any entry when audioData has multiple keys", async () => {
    const {store, mockClient} = makeUpdateAudioStore();
    const audioData = {
      0: {record: true, bitrate: 128000},
      1: {record: true, bitrate: 192000}
    };
    await store.UpdateStreamAudioSettings({objectId: "iq__1", writeToken: "wt", audioData});

    const call = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "live_recording_config/recording_stream_config/audio"
    );
    expect(call[0].metadata["0"].default).toBeUndefined();
    expect(call[0].metadata["1"].default).toBeUndefined();
  });

  it("excludes non-recording tracks when building ladder spec input", async () => {
    const {store, updateLadderSpy} = makeUpdateAudioStore();
    const audioData = {
      0: {record: true, bitrate: 128000},
      1: {record: false, bitrate: 192000}
    };
    await store.UpdateStreamAudioSettings({objectId: "iq__1", writeToken: "wt", audioData});

    expect(updateLadderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        audioData: {"0": expect.objectContaining({record: true})}
      })
    );
    const passedAudioData = updateLadderSpy.mock.calls[0][0].audioData;
    expect(passedAudioData["1"]).toBeUndefined();
  });

  it("writes updated ladder_specs and xc_params after computing audio ladder", async () => {
    const {store, mockClient} = makeUpdateAudioStore();
    await store.UpdateStreamAudioSettings({objectId: "iq__1", writeToken: "wt", audioData: {0: {record: true, bitrate: 128000}}});

    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording/recording_config/recording_params/ladder_specs"})
    );
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataSubtree: "live_recording/recording_config/recording_params/xc_params",
        metadata: expect.objectContaining({n_audio: 1, audio_bitrate: 128000})
      })
    );
  });

  it("finalizes the content object when finalize=true (default)", async () => {
    const {store, mockClient} = makeUpdateAudioStore();
    await store.UpdateStreamAudioSettings({objectId: "iq__1", writeToken: "wt", audioData: {0: {record: true, bitrate: 128000}}});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__1", commitMessage: "Update audio settings"})
    );
  });

  it("skips finalize when finalize=false", async () => {
    const {store, mockClient} = makeUpdateAudioStore();
    await store.UpdateStreamAudioSettings({objectId: "iq__1", writeToken: "wt", audioData: {0: {record: true, bitrate: 128000}}, finalize: false});
    expect(mockClient.FinalizeContentObject).not.toHaveBeenCalled();
  });
});

const makeLadderStore = ({metadataAudioData = null} = {}) => {
  const mockClient = {
    ContentObjectMetadata: vi.fn().mockResolvedValue(metadataAudioData),
  };
  const store = new StreamEditStore({client: mockClient, dataStore: {}, profileStore: {profiles: {}}, streamStore: {}});
  return {store, mockClient};
};

const audioEntry = ({
  record = true,
  recording_bitrate = 192000,
  recording_channels = 2,
  playout = false,
  playout_label = "",
  lang = "en",
  defaultTrack = false
} = {}) => ({record, recording_bitrate, recording_channels, playout, playout_label, lang, default: defaultTrack});

const ladderAudio = (channels, bit_rate = 128000) => ({channels, bit_rate});

describe("UpdateAudioLadderSpecs", () => {
  it("fetches audioData from metadata when not provided", async () => {
    const metaAudio = {0: audioEntry()};
    const {store, mockClient} = makeLadderStore({metadataAudioData: metaAudio});
    await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]}
    });
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_config/recording_stream_config/audio"})
    );
  });

  it("skips metadata fetch when audioData is provided", async () => {
    const {store, mockClient} = makeLadderStore();
    await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {0: audioEntry()}
    });
    expect(mockClient.ContentObjectMetadata).not.toHaveBeenCalled();
  });

  it("returns nAudio=0 and empty audioLadderSpecs when no streams have record=true", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {0: audioEntry({record: false}), 1: audioEntry({record: false})}
    });
    expect(result.nAudio).toBe(0);
    expect(result.audioLadderSpecs).toEqual([]);
  });

  it("counts only streams with record=true in nAudio", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {0: audioEntry({record: true}), 1: audioEntry({record: false}), 2: audioEntry({record: true})}
    });
    expect(result.nAudio).toBe(2);
  });

  it("matches ladder spec by channel count", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2, 128000), ladderAudio(6, 384000)]},
      audioData: {0: audioEntry({recording_channels: 6})}
    });
    expect(result.audioLadderSpecs[0].channels).toBe(6);
    expect(result.audioLadderSpecs[0].bit_rate).toBe(384000);
  });

  it("falls back to first ladder spec when no channel match is found", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2, 128000)]},
      audioData: {0: audioEntry({recording_channels: 6})}
    });
    expect(result.audioLadderSpecs[0].bit_rate).toBe(128000);
  });

  it("sets representation string from bit_rate", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2, 192000)]},
      audioData: {0: audioEntry()}
    });
    expect(result.audioLadderSpecs[0].representation).toBe("audioaudio_aac@192000");
  });

  it("sets stream_index and stream_name from audioIndex", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {3: audioEntry()}
    });
    expect(result.audioLadderSpecs[0].stream_index).toBe(3);
    expect(result.audioLadderSpecs[0].stream_name).toBe("audio_3");
  });

  it("sets stream_label from playout_label when playout=true", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {0: audioEntry({playout: true, playout_label: "English"})}
    });
    expect(result.audioLadderSpecs[0].stream_label).toBe("English");
  });

  it("sets stream_label to null when playout=false", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {0: audioEntry({playout: false})}
    });
    expect(result.audioLadderSpecs[0].stream_label).toBeNull();
  });

  it("forces default=true for the only stream when edit=false", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {0: audioEntry({defaultTrack: false})}
    });
    expect(result.audioLadderSpecs[0].default).toBe(true);
  });

  it("uses audioData default value for the only stream when edit=true", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {0: audioEntry({defaultTrack: false})},
      edit: true
    });
    expect(result.audioLadderSpecs[0].default).toBe(false);
  });

  it("uses audioData default for each stream when multiple streams exist", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {
        0: audioEntry({defaultTrack: true}),
        1: audioEntry({defaultTrack: false})
      }
    });
    expect(result.audioLadderSpecs[0].default).toBe(true);
    expect(result.audioLadderSpecs[1].default).toBe(false);
  });

  it("tracks globalAudioBitrate as the highest recording_bitrate across streams", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {
        0: audioEntry({recording_bitrate: 192000}),
        1: audioEntry({recording_bitrate: 384000})
      }
    });
    expect(result.globalAudioBitrate).toBe(384000);
  });

  it("fills audioIndexMeta with parsed stream indices for recorded streams", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {2: audioEntry(), 5: audioEntry()}
    });
    expect(result.audioIndexMeta[0]).toBe(2);
    expect(result.audioIndexMeta[1]).toBe(5);
  });

  it("sets media_type=2 on every ladder spec", async () => {
    const {store} = makeLadderStore();
    const result = await store.UpdateAudioLadderSpecs({
      objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt",
      ladderSpecs: {audio: [ladderAudio(2)]},
      audioData: {0: audioEntry(), 1: audioEntry()}
    });
    expect(result.audioLadderSpecs.every(s => s.media_type === 2)).toBe(true);
  });
});

describe("SyncAudioToProbe", () => {
  it("should fetch libraryId if it is not provided", async () => {
    const {store, mockClient} = makeSyncStore({});
    await store.SyncAudioToProbe({objectId: "obj-123"});
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "obj-123"});
  });

  it("should not fetch libraryId when it is already provided", async () => {
    const {store, mockClient} = makeSyncStore({});
    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});
    expect(mockClient.ContentObjectLibraryId).not.toHaveBeenCalled();
  });

  it("should create new audio config when stream index does not exist in audioConfig", async () => {
    const {store, updateAudioSpy} = makeSyncStore({
      recording_stream_config: {audio: {}},
      probe_info: {
        streams: [
          {codec_type: "audio", stream_index: 0, bit_rate: 128000, codec_name: "aac", channels: 2}
        ]
      }
    });

    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});

    expect(updateAudioSpy).toHaveBeenCalledWith({
      objectId: "obj-1",
      writeToken: undefined,
      finalize: true,
      audioData: {
        0: {bitrate: 128000, codec: "aac", playout: true, playout_label: "Audio 1", record: true, recording_bitrate: 192000, recording_channels: 2}
      }
    });
  });

  it("should update existing audio config when stream index already exists", async () => {
    const {store, updateAudioSpy} = makeSyncStore({
      recording_stream_config: {audio: {0: {bitrate: 64000, codec: "mp3", recording_channels: 1}}},
      probe_info: {
        streams: [
          {codec_type: "audio", stream_index: 0, bit_rate: 256000, codec_name: "opus", channels: 6}
        ]
      }
    });

    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});

    expect(updateAudioSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        audioData: {0: {bitrate: 256000, codec: "opus", recording_channels: 6, record: true}}
      })
    );
  });

  it("should delete audio config entries no longer present in probe streams", async () => {
    const {store, updateAudioSpy} = makeSyncStore({
      recording_stream_config: {audio: {0: {bitrate: 128000}, 1: {bitrate: 192000}}},
      probe_info: {
        streams: [
          {codec_type: "audio", stream_index: 0, bit_rate: 128000, codec_name: "aac", channels: 2}
        ]
      }
    });

    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});

    const audioData = updateAudioSpy.mock.calls[0][0].audioData;
    expect(audioData["0"]).toBeDefined();
    expect(audioData["1"]).toBeUndefined();
  });

  it("should pass writeToken and finalize through to UpdateStreamAudioSettings", async () => {
    const {store, updateAudioSpy} = makeSyncStore({});
    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1", writeToken: "wt-abc", finalize: false});
    expect(updateAudioSpy).toHaveBeenCalledWith(
      expect.objectContaining({writeToken: "wt-abc", finalize: false})
    );
  });

  it("should filter out non-audio streams from probe data", async () => {
    const {store, updateAudioSpy} = makeSyncStore({
      probe_info: {
        streams: [
          {codec_type: "video", stream_index: 0, bit_rate: 5000000, codec_name: "h264", channels: 0},
          {codec_type: "audio", stream_index: 1, bit_rate: 128000, codec_name: "aac", channels: 2}
        ]
      }
    });

    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});

    const audioData = updateAudioSpy.mock.calls[0][0].audioData;
    expect(audioData["0"]).toBeUndefined();
    expect(audioData["1"]).toBeDefined();
  });

  it("should not set record=true for existing config when there are multiple audio streams", async () => {
    const {store, updateAudioSpy} = makeSyncStore({
      recording_stream_config: {
        audio: {
          0: {bitrate: 128000, codec: "aac", recording_channels: 2, record: false},
          1: {bitrate: 128000, codec: "aac", recording_channels: 2, record: false}
        }
      },
      probe_info: {
        streams: [
          {codec_type: "audio", stream_index: 0, bit_rate: 128000, codec_name: "aac", channels: 2},
          {codec_type: "audio", stream_index: 1, bit_rate: 128000, codec_name: "aac", channels: 2}
        ]
      }
    });

    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});

    const audioData = updateAudioSpy.mock.calls[0][0].audioData;
    expect(audioData["0"].record).toBe(false);
    expect(audioData["1"].record).toBe(false);
  });

  it("should assign correct playout_label for multiple new audio streams", async () => {
    const {store, updateAudioSpy} = makeSyncStore({
      probe_info: {
        streams: [
          {codec_type: "audio", stream_index: 0, bit_rate: 128000, codec_name: "aac", channels: 2},
          {codec_type: "audio", stream_index: 1, bit_rate: 128000, codec_name: "aac", channels: 2}
        ]
      }
    });

    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});

    const audioData = updateAudioSpy.mock.calls[0][0].audioData;
    expect(audioData["0"].playout_label).toBe("Audio 1");
    expect(audioData["1"].playout_label).toBe("Audio 2");
  });

  it("should call UpdateStreamAudioSettings with empty audioData when probe has no audio streams", async () => {
    const {store, updateAudioSpy} = makeSyncStore({
      probe_info: {streams: [{codec_type: "video", stream_index: 0}]}
    });

    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});

    expect(updateAudioSpy).toHaveBeenCalledWith(expect.objectContaining({audioData: {}}));
  });

  it("should catch errors gracefully without throwing", async () => {
    const {store, mockClient} = makeSyncStore({});
    mockClient.ContentObjectMetadata.mockRejectedValue(new Error("Database Timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await store.SyncAudioToProbe({libraryId: "lib-1", objectId: "obj-1"});

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

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

const makeCopyToVodStore = ({
  titleContentType = null,
  streams = {"my-stream": {objectId: "iq__src", title: "My Stream"}},
  copyVodResponse = {jobId: "job-123"},
  copiesMetadata = null,
} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("source-lib"),
    CreateContentObject: vi.fn().mockResolvedValue({id: "iq__new", writeToken: "new-wt"}),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
    SetPermission: vi.fn().mockResolvedValue(undefined),
    StreamCopyToVod: vi.fn().mockResolvedValue(copyVodResponse),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "edit-wt"}),
    ContentObjectMetadata: vi.fn().mockResolvedValue(copiesMetadata),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
  };

  const mockRootStore = {
    client: mockClient,
    dataStore: {titleContentType},
    profileStore: {profiles: {}},
    streamStore: {streams}
  };

  const store = new StreamEditStore(mockRootStore);
  const addAccessGroupSpy = vi.fn().mockResolvedValue(undefined);
  store.AddAccessGroupPermission = addAccessGroupSpy;

  return {store, mockClient, addAccessGroupSpy};
};

describe("CopyToVod", () => {
  const singlePeriod = [{id: "period-1", start_time_epoch_sec: 1700000000, end_time_epoch_sec: 1700003600}];
  const multiPeriods = [
    {id: "period-1", start_time_epoch_sec: 1700000000, end_time_epoch_sec: 1700003600},
    {id: "period-2", start_time_epoch_sec: 1700003600, end_time_epoch_sec: 1700007200}
  ];

  it("passes recordingPeriod id for single period", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(mockClient.StreamCopyToVod).toHaveBeenCalledWith(
      expect.objectContaining({recordingPeriod: "period-1", startTime: undefined, endTime: undefined})
    );
  });

  it("sets recordingPeriod=null and startTime/endTime for multiple periods", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: multiPeriods});
    const call = mockClient.StreamCopyToVod.mock.calls[0][0];
    expect(call.recordingPeriod).toBeNull();
    expect(call.startTime).toBe(new Date(1700000000 * 1000).toISOString());
    expect(call.endTime).toBe(new Date(1700007200 * 1000).toISOString());
  });

  it("falls back to current time when period has no end_time_epoch_sec", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    const periodNoEnd = [{id: "p1", start_time_epoch_sec: 1700000000}];
    const before = Math.floor(Date.now() / 1000);
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: periodNoEnd});
    const after = Math.floor(Date.now() / 1000);

    // The copies metadata endTime should be in the current-time range
    const replaceCall = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    const savedEndTime = replaceCall[0].metadata["iq__new"].endTime;
    expect(savedEndTime).toBeGreaterThanOrEqual(before);
    expect(savedEndTime).toBeLessThanOrEqual(after);
  });

  it("fetches targetLibraryId when not provided", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", selectedPeriods: singlePeriod});
    // First call is for the target library; second is for source after StreamCopyToVod
    expect(mockClient.ContentObjectLibraryId.mock.calls[0]).toEqual([{objectId: "iq__src"}]);
  });

  it("skips ContentObjectLibraryId for target when targetLibraryId is provided", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    // Only one call: after StreamCopyToVod for the source object
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledTimes(1);
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__src"});
  });

  it("uses provided title", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod, title: "My Custom Title"});
    expect(mockClient.CreateContentObject).toHaveBeenCalledWith(
      expect.objectContaining({options: {}})
    );
    // title passed to StreamCopyToVod indirectly via copies metadata
    const replaceCall = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(replaceCall[0].metadata["iq__new"].title).toBe("My Custom Title");
  });

  it("falls back to stream title from streams store", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(replaceCall[0].metadata["iq__new"].title).toBe("My Stream VoD");
  });

  it("falls back to objectId when no stream slug matches", async () => {
    const {store, mockClient} = makeCopyToVodStore({streams: {}});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(replaceCall[0].metadata["iq__new"].title).toBe("iq__src VoD");
  });

  it("passes type and meta to CreateContentObject when titleContentType is set", async () => {
    const {store, mockClient} = makeCopyToVodStore({titleContentType: "hq__typehash"});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod, title: "T"});
    expect(mockClient.CreateContentObject).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {type: "hq__typehash", meta: {public: {name: "T"}}}
      })
    );
  });

  it("passes empty options to CreateContentObject when titleContentType is falsy", async () => {
    const {store, mockClient} = makeCopyToVodStore({titleContentType: null});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(mockClient.CreateContentObject).toHaveBeenCalledWith(
      expect.objectContaining({options: {}})
    );
  });

  it("finalizes the new VoD object before StreamCopyToVod", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__new", commitMessage: "Create VoD object"})
    );
  });

  it("propagates error when FinalizeContentObject (target) throws", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    mockClient.FinalizeContentObject.mockRejectedValueOnce(new Error("Finalize failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod})
    ).rejects.toThrow("Finalize failed");
    consoleSpy.mockRestore();
  });

  it("sets editable permission on the new VoD object", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(mockClient.SetPermission).toHaveBeenCalledWith({objectId: "iq__new", permission: "editable"});
  });

  it("propagates error when SetPermission throws", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    mockClient.SetPermission.mockRejectedValueOnce(new Error("Permission denied"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod})
    ).rejects.toThrow("Permission denied");
    consoleSpy.mockRestore();
  });

  it("calls AddAccessGroupPermission when accessGroup is provided", async () => {
    const {store, addAccessGroupSpy} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod, accessGroup: "editors"});
    expect(addAccessGroupSpy).toHaveBeenCalledWith({objectId: "iq__new", groupName: "editors"});
  });

  it("skips AddAccessGroupPermission when accessGroup is not provided", async () => {
    const {store, addAccessGroupSpy} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(addAccessGroupSpy).not.toHaveBeenCalled();
  });

  it("throws when StreamCopyToVod returns a falsy response", async () => {
    const {store} = makeCopyToVodStore({copyVodResponse: null});
    await expect(
      store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod})
    ).rejects.toThrow("Unable to copy to VoD. Is part available?");
  });

  it("writes copies metadata and finalizes source object on success", async () => {
    const {store, mockClient} = makeCopyToVodStore();
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});

    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "iq__src",
        metadataSubtree: "/live_recording_copies",
        metadata: expect.objectContaining({
          "iq__new": expect.objectContaining({
            startTime: 1700000000,
            endTime: 1700003600,
          })
        })
      })
    );
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__src", commitMessage: "Update live recording copies"})
    );
  });

  it("initializes copiesMetadata to empty object when null", async () => {
    const {store, mockClient} = makeCopyToVodStore({copiesMetadata: null});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    const call = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(Object.keys(call[0].metadata)).toEqual(["iq__new"]);
  });

  it("merges new entry into existing copiesMetadata", async () => {
    const existing = {"iq__old": {startTime: 1699000000, endTime: 1699003600, title: "Old VoD"}};
    const {store, mockClient} = makeCopyToVodStore({copiesMetadata: existing});
    await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    const call = mockClient.ReplaceMetadata.mock.calls.find(
      ([{metadataSubtree}]) => metadataSubtree === "/live_recording_copies"
    );
    expect(call[0].metadata["iq__old"]).toBeDefined();
    expect(call[0].metadata["iq__new"]).toBeDefined();
  });

  it("returns the StreamCopyToVod response", async () => {
    const {store} = makeCopyToVodStore({copyVodResponse: {jobId: "abc", status: "ok"}});
    const result = await store.CopyToVod({objectId: "iq__src", targetLibraryId: "tlib", selectedPeriods: singlePeriod});
    expect(result).toEqual({jobId: "abc", status: "ok"});
  });
});

const makeConfigureStreamStore = ({
  liveRecordingConfig = {url: "srt://host:1234", input_stream_info: {streams: []}, probe_info: {streams: []}},
  checkStatusResponse = {state: "running", warnings: [], quality: 1},
  streamDetails = {title: "My Stream"},
} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("lib-cfg"),
    ContentObjectMetadata: vi.fn().mockResolvedValue(liveRecordingConfig),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "cfg-wt"}),
    StreamConfig: vi.fn().mockResolvedValue(undefined),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
  };

  const mockStreamStore = {
    CheckStatus: vi.fn().mockResolvedValue(checkStatusResponse),
    LoadStreamMetadata: vi.fn().mockResolvedValue(streamDetails),
    UpdateStream: vi.fn(),
  };

  const mockSiteStore = {
    UpdateStreamLink: vi.fn().mockResolvedValue(undefined),
  };

  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStore: mockStreamStore,
    siteStore: mockSiteStore,
  });

  const syncAudioSpy = vi.fn().mockResolvedValue(undefined);
  store.SyncAudioToProbe = syncAudioSpy;

  return {store, mockClient, mockStreamStore, mockSiteStore, syncAudioSpy};
};

describe("ConfigureStream", () => {
  it("fetches libraryId", async () => {
    const {store, mockClient} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "s"});
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__obj"});
  });

  it("fetches live_recording_config metadata", async () => {
    const {store, mockClient} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "s"});
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_config", objectId: "iq__obj"})
    );
  });

  it("opens a write token", async () => {
    const {store, mockClient} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "s"});
    expect(mockClient.EditContentObject).toHaveBeenCalledWith({libraryId: "lib-cfg", objectId: "iq__obj"});
  });

  it("strips input_stream_info and probe_info before calling StreamConfig", async () => {
    const {store, mockClient} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "s"});
    const configArg = mockClient.StreamConfig.mock.calls[0][0].liveRecordingConfig;
    expect(configArg.input_stream_info).toBeUndefined();
    expect(configArg.probe_info).toBeUndefined();
  });

  it("passes remaining config and probeMetadata to StreamConfig", async () => {
    const probe = {streams: [{codec_type: "video"}]};
    const {store, mockClient} = makeConfigureStreamStore({
      liveRecordingConfig: {url: "srt://host:1234", input_stream_info: {}, probe_info: {}}
    });
    await store.ConfigureStream({objectId: "iq__obj", slug: "s", probeMetadata: probe});
    expect(mockClient.StreamConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "iq__obj",
        writeToken: "cfg-wt",
        finalize: false,
        liveRecordingConfig: {url: "srt://host:1234"},
        probeMetadata: probe
      })
    );
  });

  it("calls SyncAudioToProbe with writeToken and finalize=false when syncAudioToProbe=true (default)", async () => {
    const {store, syncAudioSpy} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "s"});
    expect(syncAudioSpy).toHaveBeenCalledWith({
      libraryId: "lib-cfg",
      objectId: "iq__obj",
      writeToken: "cfg-wt",
      finalize: false
    });
  });

  it("skips SyncAudioToProbe when syncAudioToProbe=false", async () => {
    const {store, syncAudioSpy} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "s", syncAudioToProbe: false});
    expect(syncAudioSpy).not.toHaveBeenCalled();
  });

  it("finalizes with the correct commit message", async () => {
    const {store, mockClient} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "s"});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "iq__obj",
        libraryId: "lib-cfg",
        writeToken: "cfg-wt",
        commitMessage: "Apply live stream configuration"
      })
    );
  });

  it("calls siteStore.UpdateStreamLink with objectId and slug", async () => {
    const {store, mockSiteStore} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "my-stream"});
    expect(mockSiteStore.UpdateStreamLink).toHaveBeenCalledWith({objectId: "iq__obj", slug: "my-stream"});
  });

  it("calls CheckStatus and LoadStreamMetadata after finalizing", async () => {
    const {store, mockStreamStore} = makeConfigureStreamStore();
    await store.ConfigureStream({objectId: "iq__obj", slug: "s"});
    expect(mockStreamStore.CheckStatus).toHaveBeenCalledWith({objectId: "iq__obj"});
    expect(mockStreamStore.LoadStreamMetadata).toHaveBeenCalledWith({objectId: "iq__obj"});
  });

  it("updates stream with merged status, warnings, quality, and streamDetails", async () => {
    const {store, mockStreamStore} = makeConfigureStreamStore({
      checkStatusResponse: {state: "running", warnings: ["low bitrate"], quality: 0.9},
      streamDetails: {title: "Live Show", url: "srt://host"}
    });
    await store.ConfigureStream({objectId: "iq__obj", slug: "my-stream"});
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith({
      key: "my-stream",
      value: {
        status: "running",
        warnings: ["low bitrate"],
        quality: 0.9,
        title: "Live Show",
        url: "srt://host"
      }
    });
  });

  it("logs error and re-throws when a client call fails", async () => {
    const {store, mockClient} = makeConfigureStreamStore();
    mockClient.StreamConfig.mockRejectedValueOnce(new Error("Config failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(store.ConfigureStream({objectId: "iq__obj", slug: "s"})).rejects.toThrow("Config failed");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

const makeWatermarkStore = ({checkStatusState = "running"} = {}) => {
  const mockClient = {
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wm-wt"}),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    DeleteMetadata: vi.fn().mockResolvedValue(undefined),
  };

  const mockStreamStore = {
    CheckStatus: vi.fn().mockResolvedValue({state: checkStatusState}),
    UpdateStream: vi.fn(),
  };

  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStore: mockStreamStore,
  });

  const addWatermarkSpy = vi.fn().mockResolvedValue(undefined);
  const removeWatermarkSpy = vi.fn().mockResolvedValue(undefined);
  store.AddWatermark = addWatermarkSpy;
  store.RemoveWatermark = removeWatermarkSpy;

  return {store, mockClient, mockStreamStore, addWatermarkSpy, removeWatermarkSpy};
};

describe("WatermarkConfiguration", () => {
  const textJson = JSON.stringify({text: "hello", size: 12});
  const imageJson = JSON.stringify({url: "img.png", width: 100});
  const forensicJson = JSON.stringify({level: 1});

  it("parses and sets textWatermark in payload when provided", async () => {
    const {store, addWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt", textWatermark: textJson
    });
    expect(addWatermarkSpy).toHaveBeenCalledWith(
      expect.objectContaining({textWatermark: JSON.parse(textJson)})
    );
  });

  it("parses and sets imageWatermark in payload when provided", async () => {
    const {store, addWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt", imageWatermark: imageJson
    });
    expect(addWatermarkSpy).toHaveBeenCalledWith(
      expect.objectContaining({imageWatermark: JSON.parse(imageJson)})
    );
  });

  it("parses and sets forensicWatermark in payload when provided", async () => {
    const {store, addWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt", forensicWatermark: forensicJson
    });
    expect(addWatermarkSpy).toHaveBeenCalledWith(
      expect.objectContaining({forensicWatermark: JSON.parse(forensicJson)})
    );
  });

  it("queues 'text' for removal when existing and new is absent", async () => {
    const {store, removeWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt",
      existingTextWatermark: {text: "old"}, textWatermark: undefined
    });
    expect(removeWatermarkSpy).toHaveBeenCalledWith(
      expect.objectContaining({types: expect.arrayContaining(["text"])})
    );
  });

  it("queues 'image' for removal when existing and new is absent", async () => {
    const {store, removeWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt",
      existingImageWatermark: {url: "old.png"}, imageWatermark: undefined
    });
    expect(removeWatermarkSpy).toHaveBeenCalledWith(
      expect.objectContaining({types: expect.arrayContaining(["image"])})
    );
  });

  it("queues 'forensic' for removal when existing and new is absent", async () => {
    const {store, removeWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt",
      existingForensicWatermark: {level: 1}, forensicWatermark: undefined
    });
    expect(removeWatermarkSpy).toHaveBeenCalledWith(
      expect.objectContaining({types: expect.arrayContaining(["forensic"])})
    );
  });

  it("takes no watermark action when both existing and new are absent", async () => {
    const {store, addWatermarkSpy, removeWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt"
    });
    expect(addWatermarkSpy).not.toHaveBeenCalled();
    expect(removeWatermarkSpy).not.toHaveBeenCalled();
  });

  it("opens a write token when writeToken is not provided", async () => {
    const {store, mockClient} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", textWatermark: textJson
    });
    expect(mockClient.EditContentObject).toHaveBeenCalledWith({objectId: "iq__obj", libraryId: "lib-1"});
  });

  it("skips EditContentObject when writeToken is provided", async () => {
    const {store, mockClient} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt", textWatermark: textJson
    });
    expect(mockClient.EditContentObject).not.toHaveBeenCalled();
  });

  it("calls AddWatermark with finalize=false when any watermark is present", async () => {
    const {store, addWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt", textWatermark: textJson
    });
    expect(addWatermarkSpy).toHaveBeenCalledWith(
      expect.objectContaining({writeToken: "wt", finalize: false})
    );
  });

  it("skips AddWatermark when no watermarks are provided", async () => {
    const {store, addWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt",
      existingTextWatermark: {text: "old"}
    });
    expect(addWatermarkSpy).not.toHaveBeenCalled();
  });

  it("calls RemoveWatermark with all queued types", async () => {
    const {store, removeWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt",
      existingTextWatermark: {text: "old"},
      existingImageWatermark: {url: "old.png"},
    });
    expect(removeWatermarkSpy).toHaveBeenCalledWith(
      expect.objectContaining({types: ["text", "image"], finalize: false})
    );
  });

  it("skips RemoveWatermark when nothing needs to be removed", async () => {
    const {store, removeWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt", textWatermark: textJson
    });
    expect(removeWatermarkSpy).not.toHaveBeenCalled();
  });

  it("calls both AddWatermark and RemoveWatermark when adding one and removing another", async () => {
    const {store, addWatermarkSpy, removeWatermarkSpy} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt",
      textWatermark: textJson,
      existingImageWatermark: {url: "old.png"},
    });
    expect(addWatermarkSpy).toHaveBeenCalled();
    expect(removeWatermarkSpy).toHaveBeenCalledWith(expect.objectContaining({types: ["image"]}));
  });

  it("finalizes and checks status when finalize=true (default)", async () => {
    const {store, mockClient, mockStreamStore} = makeWatermarkStore({checkStatusState: "running"});
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt", textWatermark: textJson
    });
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__obj", commitMessage: "Configure watermark"})
    );
    expect(mockStreamStore.CheckStatus).toHaveBeenCalledWith({objectId: "iq__obj"});
  });

  it("updates stream with status from CheckStatus when finalize=true", async () => {
    const {store, mockStreamStore} = makeWatermarkStore({checkStatusState: "stopped"});
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "my-stream", libraryId: "lib-1", writeToken: "wt", textWatermark: textJson
    });
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith({
      key: "my-stream",
      value: {status: "stopped"}
    });
  });

  it("skips FinalizeContentObject and CheckStatus when finalize=false", async () => {
    const {store, mockClient, mockStreamStore} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "s", libraryId: "lib-1", writeToken: "wt", textWatermark: textJson, finalize: false
    });
    expect(mockClient.FinalizeContentObject).not.toHaveBeenCalled();
    expect(mockStreamStore.CheckStatus).not.toHaveBeenCalled();
  });

  it("updates stream with watermarkType when finalize=false", async () => {
    const {store, mockStreamStore} = makeWatermarkStore();
    await store.WatermarkConfiguration({
      objectId: "iq__obj", slug: "my-stream", libraryId: "lib-1", writeToken: "wt",
      textWatermark: textJson, watermarkType: "text", finalize: false
    });
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith({
      key: "my-stream",
      value: {watermarkType: "text"}
    });
  });
});

const makeDrmStore = ({checkStatusState = "running"} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("lib-drm"),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "drm-wt"}),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    StreamInitialize: vi.fn().mockResolvedValue(undefined),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
  };

  const mockStreamStore = {
    CheckStatus: vi.fn().mockResolvedValue({state: checkStatusState}),
    UpdateStream: vi.fn(),
  };

  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStore: mockStreamStore,
  });

  return {store, mockClient, mockStreamStore};
};

describe("DrmConfiguration", () => {
  const clearFormats = ["hls-clear"];
  const drmFormats = ["hls-aes128", "hls-sample-aes"];

  it("returns early when existingPlayoutFormats is the same reference as playoutFormats", async () => {
    const {store, mockClient} = makeDrmStore();
    const formats = clearFormats;
    const result = await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: formats, existingPlayoutFormats: formats
    });
    expect(result).toBeUndefined();
    expect(mockClient.ContentObjectLibraryId).not.toHaveBeenCalled();
  });

  it("always fetches libraryId even when writeToken is provided", async () => {
    const {store, mockClient} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "existing-wt", status: "running"
    });
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__obj"});
  });

  it("skips EditContentObject when writeToken is provided", async () => {
    const {store, mockClient} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "existing-wt", status: "running"
    });
    expect(mockClient.EditContentObject).not.toHaveBeenCalled();
  });

  it("opens a write token when writeToken is not provided", async () => {
    const {store, mockClient} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, status: "running"
    });
    expect(mockClient.EditContentObject).toHaveBeenCalledWith({objectId: "iq__obj", libraryId: "lib-drm"});
  });

  it("writes playout_formats to the correct metadata subtree", async () => {
    const {store, mockClient} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running"
    });
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataSubtree: "live_recording/playout_config/playout_formats",
        metadata: drmFormats,
      })
    );
  });

  // STATUS_MAP is mocked as {} so UNINITIALIZED/UNCONFIGURED are undefined.
  // Passing status=undefined matches those values and skips StreamInitialize.
  it("skips StreamInitialize when status is UNINITIALIZED or UNCONFIGURED", async () => {
    const {store, mockClient} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: undefined
    });
    expect(mockClient.StreamInitialize).not.toHaveBeenCalled();
  });

  it("calls StreamInitialize when status is an active state", async () => {
    const {store, mockClient} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running"
    });
    expect(mockClient.StreamInitialize).toHaveBeenCalled();
  });

  it("sets drm=true in StreamInitialize when any format is non-clear", async () => {
    const {store, mockClient} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running"
    });
    expect(mockClient.StreamInitialize).toHaveBeenCalledWith(
      expect.objectContaining({drm: true, format: drmFormats.join(",")})
    );
  });

  it("sets drm=false in StreamInitialize when all formats are clear", async () => {
    const {store, mockClient} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: clearFormats, existingPlayoutFormats: drmFormats, writeToken: "wt", status: "running"
    });
    expect(mockClient.StreamInitialize).toHaveBeenCalledWith(
      expect.objectContaining({drm: false})
    );
  });

  it("finalizes and checks status when finalize=true (default)", async () => {
    const {store, mockClient, mockStreamStore} = makeDrmStore({checkStatusState: "running"});
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running"
    });
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__obj", commitMessage: "Update drm type metadata"})
    );
    expect(mockStreamStore.CheckStatus).toHaveBeenCalledWith({objectId: "iq__obj"});
  });

  it("updates stream with status from CheckStatus when finalize=true", async () => {
    const {store, mockStreamStore} = makeDrmStore({checkStatusState: "stopped"});
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "my-stream", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running"
    });
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith({
      key: "my-stream",
      value: {status: "stopped"}
    });
  });

  it("skips FinalizeContentObject and CheckStatus when finalize=false", async () => {
    const {store, mockClient, mockStreamStore} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running", finalize: false
    });
    expect(mockClient.FinalizeContentObject).not.toHaveBeenCalled();
    expect(mockStreamStore.CheckStatus).not.toHaveBeenCalled();
  });

  it("updates stream with drm=playoutFormats when finalize=false", async () => {
    const {store, mockStreamStore} = makeDrmStore();
    await store.DrmConfiguration({
      objectId: "iq__obj", slug: "my-stream", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running", finalize: false
    });
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith({
      key: "my-stream",
      value: {drm: drmFormats}
    });
  });

  it("returns drmNeedsInit=false and correct drmInitPayload when finalize=true", async () => {
    const {store} = makeDrmStore();
    const result = await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running"
    });
    expect(result.drmNeedsInit).toBe(false);
    expect(result.drmInitPayload).toEqual({
      name: "iq__obj",
      drm: true,
      format: drmFormats.join(",")
    });
  });

  it("returns drmNeedsInit=true when finalize=false", async () => {
    const {store} = makeDrmStore();
    const result = await store.DrmConfiguration({
      objectId: "iq__obj", slug: "s", playoutFormats: drmFormats, existingPlayoutFormats: clearFormats, writeToken: "wt", status: "running", finalize: false
    });
    expect(result.drmNeedsInit).toBe(true);
  });
});

describe("FetchLiveRecordingCopies", () => {
  const makeFetchStore = (copiesData = {"copy-1": {title: "Copy 1"}}) => {
    const mockClient = {
      ContentObjectLibraryId: vi.fn().mockResolvedValue("fetched-lib"),
      ContentObjectMetadata: vi.fn().mockResolvedValue(copiesData),
    };
    const store = new StreamEditStore({
      client: mockClient,
      dataStore: {},
      profileStore: {profiles: {}},
      streamStore: {}
    });
    return {store, mockClient};
  };

  it("fetches libraryId when not provided", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj"});
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__obj"});
  });

  it("skips ContentObjectLibraryId when libraryId is already provided", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(mockClient.ContentObjectLibraryId).not.toHaveBeenCalled();
  });

  it("uses the provided libraryId in the metadata call", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({libraryId: "ilib-given"})
    );
  });

  it("uses the fetched libraryId in the metadata call when none is provided", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj"});
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({libraryId: "fetched-lib"})
    );
  });

  it("reads from the live_recording_copies subtree", async () => {
    const {store, mockClient} = makeFetchStore();
    await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(mockClient.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_copies"})
    );
  });

  it("returns the ContentObjectMetadata result", async () => {
    const copies = {"copy-1": {title: "A"}, "copy-2": {title: "B"}};
    const {store} = makeFetchStore(copies);
    const result = await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(result).toEqual(copies);
  });

  it("returns null when there are no copies", async () => {
    const {store} = makeFetchStore(null);
    const result = await store.FetchLiveRecordingCopies({objectId: "iq__obj", libraryId: "ilib-given"});
    expect(result).toBeNull();
  });
});

const makeDeleteCopyStore = (initialCopies = {"copy-1": {title: "Copy 1"}, "copy-2": {title: "Copy 2"}}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("lib-1"),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-del"}),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    FinalizeContentObject: vi.fn().mockResolvedValue({hash: "hq__finalized"}),
  };

  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStore: {}
  });

  // Stub FetchLiveRecordingCopies to avoid its internal client calls
  const fetchCopiesSpy = vi.fn().mockResolvedValue({...initialCopies});
  store.FetchLiveRecordingCopies = fetchCopiesSpy;

  return {store, mockClient, fetchCopiesSpy};
};

describe("DeleteLiveRecordingCopy", () => {
  it("calls FetchLiveRecordingCopies with the streamId", async () => {
    const {store, fetchCopiesSpy} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(fetchCopiesSpy).toHaveBeenCalledWith({objectId: "iq__stream"});
  });

  it("removes the specified recordingCopyId", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls[0][0];
    expect(replaceCall.metadata["copy-1"]).toBeUndefined();
  });

  it("preserves other entries when deleting one", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls[0][0];
    expect(replaceCall.metadata["copy-2"]).toEqual({title: "Copy 2"});
  });

  it("results in empty metadata when deleting the only entry", async () => {
    const {store, mockClient} = makeDeleteCopyStore({"copy-1": {title: "Only Copy"}});
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls[0][0];
    expect(replaceCall.metadata).toEqual({});
  });

  it("is a no-op delete when recordingCopyId does not exist", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-999"});
    const replaceCall = mockClient.ReplaceMetadata.mock.calls[0][0];
    expect(Object.keys(replaceCall.metadata)).toEqual(["copy-1", "copy-2"]);
  });

  it("fetches libraryId via ContentObjectLibraryId", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__stream"});
  });

  it("opens a write token via EditContentObject", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(mockClient.EditContentObject).toHaveBeenCalledWith({objectId: "iq__stream", libraryId: "lib-1"});
  });

  it("writes updated copies to live_recording_copies subtree", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "iq__stream",
        libraryId: "lib-1",
        writeToken: "wt-del",
        metadataSubtree: "live_recording_copies",
      })
    );
  });

  it("finalizes with the correct commit message", async () => {
    const {store, mockClient} = makeDeleteCopyStore();
    await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "iq__stream",
        libraryId: "lib-1",
        writeToken: "wt-del",
        commitMessage: "Remove live recording copy",
      })
    );
  });

  it("returns the FinalizeContentObject response", async () => {
    const {store} = makeDeleteCopyStore();
    const result = await store.DeleteLiveRecordingCopy({streamId: "iq__stream", recordingCopyId: "copy-1"});
    expect(result).toEqual({hash: "hq__finalized"});
  });
});

// ─── DeleteStream ─────────────────────────────────────────────────────────────

const makeDeleteStreamStore = (streams = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-1"),
    StreamRemoveLinkToSite: vi.fn().mockResolvedValue(undefined),
    DeleteContentObject: vi.fn().mockResolvedValue(undefined),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-del"}),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
  };
  const mockStreamStore = {
    streams,
    UpdateStream: vi.fn(),
    UpdateStreams: vi.fn(),
  };
  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {siteId: "iq__site", siteLibraryId: "ilib-site"},
    profileStore: {profiles: {}},
    streamStore: mockStreamStore,
  });
  return {store, mockClient, mockStreamStore};
};

describe("DeleteStream", () => {
  it("resolves slug from objectId when slug is not provided", async () => {
    const {store, mockStreamStore} = makeDeleteStreamStore({"my-stream": {objectId: "iq__obj"}});
    await store.DeleteStream({objectId: "iq__obj"});
    const updatedStreams = mockStreamStore.UpdateStreams.mock.calls[0][0].streams;
    expect(updatedStreams["my-stream"]).toBeUndefined();
  });

  it("calls StreamRemoveLinkToSite with objectId and slug", async () => {
    const {store, mockClient} = makeDeleteStreamStore({"my-stream": {objectId: "iq__obj"}});
    await store.DeleteStream({objectId: "iq__obj", slug: "my-stream"});
    expect(mockClient.StreamRemoveLinkToSite).toHaveBeenCalledWith(
      expect.objectContaining({objectId: "iq__obj", slug: "my-stream"})
    );
  });

  it("calls DeleteContentObject after fetching libraryId", async () => {
    const {store, mockClient} = makeDeleteStreamStore({"my-stream": {objectId: "iq__obj"}});
    await store.DeleteStream({objectId: "iq__obj", slug: "my-stream"});
    expect(mockClient.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__obj"});
    expect(mockClient.DeleteContentObject).toHaveBeenCalledWith({libraryId: "ilib-1", objectId: "iq__obj"});
  });

  it("continues silently when DeleteContentObject throws", async () => {
    const {store, mockClient, mockStreamStore} = makeDeleteStreamStore({"my-stream": {objectId: "iq__obj"}});
    mockClient.DeleteContentObject.mockRejectedValue(new Error("already gone"));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await store.DeleteStream({objectId: "iq__obj", slug: "my-stream"});
    consoleSpy.mockRestore();
    expect(mockStreamStore.UpdateStreams).toHaveBeenCalled();
  });

  it("removes the slug from streams and calls UpdateStreams", async () => {
    const {store, mockStreamStore} = makeDeleteStreamStore({
      "my-stream": {objectId: "iq__obj"},
      "other-stream": {objectId: "iq__other"}
    });
    await store.DeleteStream({objectId: "iq__obj", slug: "my-stream"});
    const updatedStreams = mockStreamStore.UpdateStreams.mock.calls[0][0].streams;
    expect(updatedStreams["my-stream"]).toBeUndefined();
    expect(updatedStreams["other-stream"]).toBeDefined();
  });
});

// ─── DeleteStreamBatch ────────────────────────────────────────────────────────

describe("DeleteStreamBatch", () => {
  it("opens a shared write token on the site object", async () => {
    const {store, mockClient} = makeDeleteStreamStore({"s1": {objectId: "iq__1"}});
    await store.DeleteStreamBatch({objects: [{objectId: "iq__1", slug: "s1"}]});
    expect(mockClient.EditContentObject).toHaveBeenCalledWith({libraryId: "ilib-site", objectId: "iq__site"});
  });

  it("calls StreamRemoveLinkToSite with finalize=false for each object", async () => {
    const {store, mockClient} = makeDeleteStreamStore({
      "s1": {objectId: "iq__1"},
      "s2": {objectId: "iq__2"}
    });
    await store.DeleteStreamBatch({objects: [
      {objectId: "iq__1", slug: "s1"},
      {objectId: "iq__2", slug: "s2"}
    ]});
    expect(mockClient.StreamRemoveLinkToSite).toHaveBeenCalledTimes(2);
    expect(mockClient.StreamRemoveLinkToSite).toHaveBeenCalledWith(
      expect.objectContaining({finalize: false, writeToken: "wt-del"})
    );
  });

  it("continues silently when DeleteContentObject throws for a batch item", async () => {
    const {store, mockClient, mockStreamStore} = makeDeleteStreamStore({"s1": {objectId: "iq__1"}});
    mockClient.DeleteContentObject.mockRejectedValue(new Error("already gone"));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await store.DeleteStreamBatch({objects: [{objectId: "iq__1", slug: "s1"}]});
    consoleSpy.mockRestore();
    expect(mockStreamStore.UpdateStreams).toHaveBeenCalled();
  });

  it("removes all batch slugs from streams", async () => {
    const {store, mockStreamStore} = makeDeleteStreamStore({
      "s1": {objectId: "iq__1"},
      "s2": {objectId: "iq__2"},
      "s3": {objectId: "iq__3"}
    });
    await store.DeleteStreamBatch({objects: [
      {objectId: "iq__1", slug: "s1"},
      {objectId: "iq__2", slug: "s2"}
    ]});
    const updatedStreams = mockStreamStore.UpdateStreams.mock.calls[0][0].streams;
    expect(updatedStreams["s1"]).toBeUndefined();
    expect(updatedStreams["s2"]).toBeUndefined();
    expect(updatedStreams["s3"]).toBeDefined();
  });

  it("finalizes with correct commit message", async () => {
    const {store, mockClient} = makeDeleteStreamStore({"s1": {objectId: "iq__1"}});
    await store.DeleteStreamBatch({objects: [{objectId: "iq__1", slug: "s1"}]});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({commitMessage: "Remove live streams"})
    );
  });
});

// ─── UpdateConfigMetadata ─────────────────────────────────────────────────────

const makeConfigMetaStore = ({existingConfig = {}} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-1"),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-cfg"}),
    ContentObjectMetadata: vi.fn().mockResolvedValue(existingConfig),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    DeleteMetadata: vi.fn().mockResolvedValue(undefined),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
  };
  const mockStreamStore = {UpdateStream: vi.fn()};
  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStore: mockStreamStore,
  });
  return {store, mockClient, mockStreamStore};
};

describe("UpdateConfigMetadata", () => {
  it("writes dvr_enabled to both live_recording and live_recording_overrides", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", dvrEnabled: true, finalize: false});
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording/playout_config/dvr_enabled", metadata: true})
    );
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_overrides/playout_config/dvr_enabled", metadata: true})
    );
  });

  it("writes dvr_start_time to both paths when dvrEnabled and dvrStartTime are set", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    const startTime = new Date("2026-01-01T10:00:00Z");
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", dvrEnabled: true, dvrStartTime: startTime, finalize: false});
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording/playout_config/dvr_start_time"})
    );
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_overrides/playout_config/dvr_start_time"})
    );
  });

  it("writes dvr_max_duration as integer to both paths", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", dvrEnabled: true, dvrMaxDuration: "3600", finalize: false});
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording/playout_config/dvr_max_duration", metadata: 3600})
    );
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording_overrides/playout_config/dvr_max_duration", metadata: 3600})
    );
  });

  it("deletes dvr_start_time and dvr_max_duration from both paths when dvrEnabled=false", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", dvrEnabled: false, finalize: false});
    const deletedPaths = mockClient.DeleteMetadata.mock.calls.map(c => c[0].metadataSubtree);
    expect(deletedPaths).toContain("live_recording/playout_config/dvr_start_time");
    expect(deletedPaths).toContain("live_recording/playout_config/dvr_max_duration");
    expect(deletedPaths).toContain("live_recording_overrides/playout_config/dvr_start_time");
    expect(deletedPaths).toContain("live_recording_overrides/playout_config/dvr_max_duration");
  });

  it("skips all DVR writes when skipDvrSection=true", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", dvrEnabled: true, skipDvrSection: true, finalize: false});
    const writtenPaths = mockClient.ReplaceMetadata.mock.calls.map(c => c[0].metadataSubtree);
    expect(writtenPaths.some(p => p.includes("dvr"))).toBe(false);
  });

  it("skips DVR writes when dvrEnabled is undefined", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", finalize: false});
    const writtenPaths = mockClient.ReplaceMetadata.mock.calls.map(c => c[0].metadataSubtree);
    expect(writtenPaths.some(p => p.includes("dvr"))).toBe(false);
  });

  it("writes retention as integer to live_recording", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", retention: "7200", finalize: false});
    expect(mockClient.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "live_recording/recording_config/recording_params/part_ttl", metadata: 7200})
    );
  });

  it("calls FinalizeContentObject when finalize=true", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt"});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({commitMessage: "Update recording config"})
    );
  });

  it("skips FinalizeContentObject when finalize=false", async () => {
    const {store, mockClient} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", finalize: false});
    expect(mockClient.FinalizeContentObject).not.toHaveBeenCalled();
  });

  it("calls UpdateStream with parsed dvrEnabled and retention values", async () => {
    const {store, mockStreamStore} = makeConfigMetaStore();
    await store.UpdateConfigMetadata({objectId: "iq__obj", libraryId: "lib-1", writeToken: "wt", slug: "s1", dvrEnabled: true, retention: "3600", finalize: false});
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({key: "s1", value: expect.objectContaining({dvrEnabled: true, partTtl: 3600})})
    );
  });
});

// ─── AddWatermark ─────────────────────────────────────────────────────────────

const makeAddWatermarkStore = () => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-1"),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-wm"}),
    StreamAddWatermark: vi.fn().mockResolvedValue(null),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
  };
  const mockStreamStore = {UpdateStream: vi.fn()};
  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStore: mockStreamStore,
  });
  return {store, mockClient, mockStreamStore};
};

describe("AddWatermark", () => {
  it("passes imageWatermark when provided", async () => {
    const {store, mockClient} = makeAddWatermarkStore();
    const wm = {url: "img.png"};
    await store.AddWatermark({objectId: "iq__obj", writeToken: "wt", imageWatermark: wm, finalize: false});
    expect(mockClient.StreamAddWatermark).toHaveBeenCalledWith(expect.objectContaining({imageWatermark: wm}));
  });

  it("passes simpleWatermark for text when no imageWatermark", async () => {
    const {store, mockClient} = makeAddWatermarkStore();
    const wm = {text: "hello"};
    await store.AddWatermark({objectId: "iq__obj", writeToken: "wt", textWatermark: wm, finalize: false});
    expect(mockClient.StreamAddWatermark).toHaveBeenCalledWith(expect.objectContaining({simpleWatermark: wm}));
    expect(mockClient.StreamAddWatermark).not.toHaveBeenCalledWith(expect.objectContaining({imageWatermark: expect.anything()}));
  });

  it("passes forensicWatermark when no image or text watermark", async () => {
    const {store, mockClient} = makeAddWatermarkStore();
    const wm = {level: 1};
    await store.AddWatermark({objectId: "iq__obj", writeToken: "wt", forensicWatermark: wm, finalize: false});
    expect(mockClient.StreamAddWatermark).toHaveBeenCalledWith(expect.objectContaining({forensicWatermark: wm}));
  });

  it("calls FinalizeContentObject when finalize=true", async () => {
    const {store, mockClient} = makeAddWatermarkStore();
    await store.AddWatermark({objectId: "iq__obj", writeToken: "wt", textWatermark: {text: "hi"}, finalize: true});
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({commitMessage: "Set watermark"})
    );
  });

  it("skips FinalizeContentObject when finalize=false", async () => {
    const {store, mockClient} = makeAddWatermarkStore();
    await store.AddWatermark({objectId: "iq__obj", writeToken: "wt", textWatermark: {text: "hi"}, finalize: false});
    expect(mockClient.FinalizeContentObject).not.toHaveBeenCalled();
  });

  it("calls UpdateStream with response watermark fields when response is truthy", async () => {
    const {store, mockClient, mockStreamStore} = makeAddWatermarkStore();
    mockClient.StreamAddWatermark.mockResolvedValue({imageWatermark: null, textWatermark: {text: "hi"}, forensicWatermark: null});
    await store.AddWatermark({objectId: "iq__obj", slug: "my-stream", writeToken: "wt", textWatermark: {text: "hi"}, finalize: false});
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({key: "my-stream", value: expect.objectContaining({simpleWatermark: {text: "hi"}})})
    );
  });

  it("skips UpdateStream when response is null", async () => {
    const {store, mockStreamStore} = makeAddWatermarkStore();
    await store.AddWatermark({objectId: "iq__obj", slug: "my-stream", writeToken: "wt", textWatermark: {text: "hi"}, finalize: false});
    expect(mockStreamStore.UpdateStream).not.toHaveBeenCalled();
  });
});

// ─── RemoveWatermark ──────────────────────────────────────────────────────────

const makeRemoveWatermarkStore = () => {
  const mockClient = {
    StreamRemoveWatermark: vi.fn().mockResolvedValue(undefined),
  };
  const mockStreamStore = {UpdateStream: vi.fn()};
  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStore: mockStreamStore,
  });
  return {store, mockClient, mockStreamStore};
};

describe("RemoveWatermark", () => {
  it("calls StreamRemoveWatermark with types and writeToken", async () => {
    const {store, mockClient} = makeRemoveWatermarkStore();
    await store.RemoveWatermark({objectId: "iq__obj", slug: "s", writeToken: "wt", types: ["image"], finalize: false});
    expect(mockClient.StreamRemoveWatermark).toHaveBeenCalledWith(
      expect.objectContaining({types: ["image"], writeToken: "wt", finalize: false})
    );
  });

  it("clears imageWatermark on stream when type is image", async () => {
    const {store, mockStreamStore} = makeRemoveWatermarkStore();
    await store.RemoveWatermark({objectId: "iq__obj", slug: "my-stream", writeToken: "wt", types: ["image"], finalize: false});
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({key: "my-stream", value: expect.objectContaining({imageWatermark: undefined})})
    );
  });

  it("clears simpleWatermark on stream when type is text", async () => {
    const {store, mockStreamStore} = makeRemoveWatermarkStore();
    await store.RemoveWatermark({objectId: "iq__obj", slug: "my-stream", writeToken: "wt", types: ["text"], finalize: false});
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({key: "my-stream", value: expect.objectContaining({simpleWatermark: undefined})})
    );
  });

  it("clears forensicWatermark on stream when type is forensic", async () => {
    const {store, mockStreamStore} = makeRemoveWatermarkStore();
    await store.RemoveWatermark({objectId: "iq__obj", slug: "my-stream", writeToken: "wt", types: ["forensic"], finalize: false});
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({key: "my-stream", value: expect.objectContaining({forensicWatermark: undefined})})
    );
  });

  it("clears all named watermarks when multiple types are provided", async () => {
    const {store, mockStreamStore} = makeRemoveWatermarkStore();
    await store.RemoveWatermark({objectId: "iq__obj", slug: "my-stream", writeToken: "wt", types: ["image", "text"], finalize: false});
    const value = mockStreamStore.UpdateStream.mock.calls[0][0].value;
    expect(value.imageWatermark).toBeUndefined();
    expect(value.simpleWatermark).toBeUndefined();
  });
});

// ─── UpdatePlayoutConfig ──────────────────────────────────────────────────────

const makePlayoutConfigStore = ({status = "inactive"} = {}) => {
  const mockClient = {
    ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-1"),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt-playout"}),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
  };
  const mockStreamStore = {
    CheckStatus: vi.fn().mockResolvedValue({state: status}),
    UpdateStream: vi.fn(),
  };
  const store = new StreamEditStore({
    client: mockClient,
    dataStore: {},
    profileStore: {profiles: {}},
    streamStore: mockStreamStore,
  });
  const watermarkSpy = vi.fn().mockResolvedValue(undefined);
  const drmSpy = vi.fn().mockResolvedValue(undefined);
  const configMetaSpy = vi.fn().mockResolvedValue(undefined);
  store.WatermarkConfiguration = watermarkSpy;
  store.DrmConfiguration = drmSpy;
  store.UpdateConfigMetadata = configMetaSpy;
  return {store, mockClient, mockStreamStore, watermarkSpy, drmSpy, configMetaSpy};
};

describe("UpdatePlayoutConfig", () => {
  const baseParams = {
    objectId: "iq__obj", slug: "my-stream", status: "inactive",
    watermarkParams: {watermarkType: "TEXT", textWatermark: "{}", imageWatermark: null, forensicWatermark: null, existingTextWatermark: null, existingImageWatermark: null, existingForensicWatermark: null},
    drmParams: {existingPlayoutFormats: ["hls-clear"], playoutFormats: ["hls-clear"]},
    configMetaParams: {dvrEnabled: false, dvrMaxDuration: "0", dvrStartTime: null, skipDvrSection: false}
  };

  it("calls WatermarkConfiguration, DrmConfiguration, UpdateConfigMetadata each with finalize=false", async () => {
    const {store, watermarkSpy, drmSpy, configMetaSpy} = makePlayoutConfigStore();
    await store.UpdatePlayoutConfig(baseParams);
    expect(watermarkSpy).toHaveBeenCalledWith(expect.objectContaining({finalize: false}));
    expect(drmSpy).toHaveBeenCalledWith(expect.objectContaining({finalize: false}));
    expect(configMetaSpy).toHaveBeenCalledWith(expect.objectContaining({finalize: false}));
  });

  it("finalizes with the playout settings commit message", async () => {
    const {store, mockClient} = makePlayoutConfigStore();
    await store.UpdatePlayoutConfig(baseParams);
    expect(mockClient.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({commitMessage: "Apply playout settings"})
    );
  });

  it("checks status and updates stream after finalize", async () => {
    const {store, mockStreamStore} = makePlayoutConfigStore({status: "stopped"});
    await store.UpdatePlayoutConfig(baseParams);
    expect(mockStreamStore.CheckStatus).toHaveBeenCalledWith({objectId: "iq__obj"});
    expect(mockStreamStore.UpdateStream).toHaveBeenCalledWith(
      expect.objectContaining({key: "my-stream", value: {status: "stopped"}})
    );
  });
});
