// Force strict mode so mutations are only allowed within actions.
import {configure, flow, makeAutoObservable} from "mobx";
import UrlJoin from "url-join";
import {ENCRYPTION_OPTIONS, STATUS_MAP} from "@/utils/constants";
import {ParseLiveConfigData} from "@/utils/helpers.js";

configure({
  enforceActions: "always"
});

// Focuses on the viewer's experience, loading and providing access to all browsable streams.
class StreamBrowseStore {
  streams;
  streamFrameUrls = {};
  showMonitorPreviews = false;
  loadingStatus = false;
  streamFilter = "";

  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }

  ToggleMonitorPreviews() {
    this.showMonitorPreviews = !this.showMonitorPreviews;
  }

  UpdateStream = ({key, value={}}) => {
    if(!key) { return; }

    this.streams[key] = {
      ...(this.streams[key] || {}),
      ...value,
      slug: key
    };
  };

  UpdateStreams = ({streams}) => {
    this.streams = streams;
  };

  SetStreamFilter = ({filter}) => {
    this.streamFilter = filter;
  };

  ConfigureStream = flow(function * ({
    objectId,
    slug,
    probeMetadata,
    syncAudioToProbe=true
  }) {
    try {
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});
      const liveRecordingConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config",
        select: [
          "input/audio/stream_index",
          "input/audio/stream",
          "output/audio/bitrate",
          "output/audio/channel_layout",
          "part_ttl",
          "persistent",
          "drm",
          "drm_type",
          "audio",
          "playout_ladder_profile",
          "reconnect_timeout"
        ]
      });

      const recordingConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/recording_config",
        select: [
          "recording_params/xc_params/connection_timeout",
          "recording_params/reconnect_timeout",
          "recording_params/xc_params/copy_mpegts"
        ]
      });

      const playoutConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/playout_config",
        select: [
          "simple_watermark",
          "image_watermark",
          "forensic_watermark"
        ]
      });

      const configSettings = {};

      // Config api will override meta containing edge write token
      // if(edgeWriteToken) {
      //   customSettings.metaPathValues["live_recording.fabric_config.edge_write_token = customSettings.edge_write_token"] = edgeWriteToken;
      // }

      if(liveRecordingConfig.part_ttl) {
        configSettings.retention = liveRecordingConfig.part_ttl;
      }

      if(Object.hasOwn(liveRecordingConfig, "persistent")) {
        // TODO: Add persistent
      }

      if(recordingConfig?.recording_params?.xc_params?.connection_timeout) {
        configSettings.connectionTimeout = recordingConfig.recording_params.xc_params.connection_timeout;
      }

      if(
        recordingConfig?.recording_params?.reconnect_timeout ||
        liveRecordingConfig?.reconnect_timeout
      ) {
        configSettings.reconnectionTimeout = recordingConfig?.recording_params?.reconnect_timeout || liveRecordingConfig?.reconnect_timeout;
      }

      if(playoutConfig?.simple_watermark) {
        configSettings.simpleWatermark = playoutConfig.simple_watermark;
      }

      if(playoutConfig?.image_watermark) {
        configSettings.imageWatermark = playoutConfig.image_watermark;
      }

      if(playoutConfig?.forensic_watermark) {
        configSettings.forensicWatermark = playoutConfig.forensic_watermark;
      }

      if(Object.hasOwn(recordingConfig?.recording_params?.xc_params || {}, "copy_mpegts")) {
        configSettings.copyMpegTs = recordingConfig.recording_params.xc_params.copy_mpegts;
      }

      if(liveRecordingConfig.playout_ladder_profile) {
        const allProfiles = yield this.client.ContentObjectMetadata({
          libraryId: yield this.client.ContentObjectLibraryId({objectId: this.rootStore.dataStore.siteId}),
          objectId: this.rootStore.dataStore.siteId,
          metadataSubtree: "public/asset_metadata/profiles"
        });

        if(allProfiles) {
          let profileData;
          if(liveRecordingConfig.playout_ladder_profile.toLowerCase() === "default") {
            profileData = allProfiles.default;
          } else {
            profileData = allProfiles.custom.find(item => item.name === liveRecordingConfig.playout_ladder_profile);
          }

          if(profileData) {
            configSettings.playoutProfile = profileData.ladder_specs;
          } else {
            // eslint-disable-next-line no-console
            console.warn(`Ladder profile ${liveRecordingConfig.playout_ladder_profile} not found. Defaulting to the built-in profile.`);
          }
        }
      }

      if(liveRecordingConfig.audio) {
        // Remove audio tracks with a falsey record property
        Object.keys(liveRecordingConfig.audio).forEach(audioIndex => {
          if(!liveRecordingConfig.audio[audioIndex].record) {
            delete liveRecordingConfig.audio[audioIndex];
          }
        });
      }

      if(liveRecordingConfig.drm_type) {
        configSettings.encryption = liveRecordingConfig.drm_type;
      }

      configSettings.audioFormData = liveRecordingConfig.audio ? liveRecordingConfig.audio : undefined;

      const {writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      });

      const config = ParseLiveConfigData(configSettings);

      yield this.client.StreamConfig({
        name: objectId,
        writeToken,
        finalize: false,
        liveRecordingConfig: config,
        probeMetadata
      });

      if(syncAudioToProbe) {
        yield this.SyncAudioToProbe({
          libraryId,
          objectId,
          writeToken,
          finalize: false
        });
      }


      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Apply live stream configuration"
      });

      // Update stream link in site after stream configuration
      yield this.rootStore.siteStore.UpdateStreamLink({objectId, slug});

      const response = yield this.CheckStatus({
        objectId
      });

      const streamDetails = yield this.rootStore.dataStore.LoadStreamMetadata({
        objectId
      });

      this.UpdateStream({
        key: slug,
        value: {
          status: response.state,
          warnings: response.warnings,
          quality: response.quality,
          ...streamDetails
        }
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to configure stream", error);
      throw error;
    }
  });

  CheckStatus = flow(function * ({
    objectId,
    slug,
    showParams=false,
    update=false
  }) {
    let response;
    try {
      response = yield this.client.StreamStatus({
        name: objectId,
        showParams
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load status for ${objectId || "object"}`, error);
      return {};
    }

    if(update) {
      if(!slug) {
        slug = Object.keys(this.streams || {}).find(slug => (
          this.streams[slug].objectId === objectId
        ));
      }

      this.UpdateStream({
        key: slug,
        value: {
          status: response.state,
          warnings: response.warnings,
          quality: response.quality,
          embedUrl: response?.playout_urls?.embed_url
        }
      });
    }

    return response;
  });

  StartStream = flow(function * ({
    slug,
    start=false
  }) {
    const objectId = this.streams[slug].objectId;
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    const response = yield this.CheckStatus({
      objectId: this.streams[slug].objectId
    });
    switch(response.state) {
      case "unconfigured":
      case "uninitialized":
        throw Error("Stream not ready to start");
      case "starting":
      case "running":
      case "stalled":
        // Already started - nothing to do
        return;
    }

    const edgeWriteToken = response.edge_write_token;

    let tokenMeta;

    if(edgeWriteToken) {
      tokenMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/status/edge_write_token"
      });
    }

    if(!tokenMeta || tokenMeta !== edgeWriteToken) {
      yield this.client.StreamStartRecording({name: objectId, start});
    }

    yield this.OperateLRO({
      objectId,
      slug,
      operation: "START"
    });
  });

  OperateLRO = flow(function * ({
    objectId,
    slug,
    operation
  }) {
    const OP_MAP = {
      START: "start",
      RESET: "reset",
      STOP: "stop"
    };

    try {
      const response = yield this.client.StreamStartOrStopOrReset({
        name: objectId,
        op: OP_MAP[operation]
      });

      if(response?.error) {
        throw new Error(response.error);
      }

      this.UpdateStream({key: slug, value: { status: response.state }});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to ${OP_MAP[operation]} LRO.`, error);
      throw error;
    }
  });

  DeactivateStream = flow(function * ({objectId, slug}) {
    try {
      const response = yield this.client.StreamStopRecording({name: objectId});

      if(!response) { return; }

      this.UpdateStream({key: slug, value: { status: response.state }});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to deactivate stream", error);
    }
  });

  AllStreamsStatus = flow(function * (reload=false) {
    if(this.loadingStatus && !reload) { return; }

    try {
      this.loadingStatus = true;

      yield this.client.utils.LimitedMap(
        15,
        Object.keys(this.streams || {}),
        async slug => {
          const streamMeta = this.streams?.[slug];
          try {
            await this.CheckStatus({
              objectId: streamMeta.objectId,
              slug,
              update: true
            });
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error(`Skipping status for ${this.streams?.[slug].objectId || slug}.`, error);
          }
        }
      );
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      this.loadingStatus = false;
    }
  });

  async FetchVideoPath(stream, playlistPath) {
    const [path, params] = playlistPath.split("?");
    const searchParams = new URLSearchParams(params);
    searchParams.delete("authorization");

    const browserSupportedDrms = (await this.client.AvailableDRMs() || []).filter(drm => ["clear", "aes-128"].includes(drm));

    let playoutOptions, playoutMethods, playoutMethod;
    playoutOptions = await this.client.PlayoutOptions({
      objectId: stream.objectId,
      protocols: ["hls"],
      drms: browserSupportedDrms,
      offering: "default"
    });

    playoutMethods = playoutOptions?.hls?.playoutMethods;

    if(playoutMethods["clear"]) {
      playoutMethod = "hls-clear";
    } else if(playoutMethods["aes-128"]) {
      playoutMethod = "hls-aes128";
    } else if(playoutMethods["fairplay"]) {
      playoutMethod = "hls-fairplay";
    } else if(playoutMethods["sample-aes"]) {
      playoutMethod = "hls-sample-aes";
    }

    const url = new URL(
      await this.client.FabricUrl({
        libraryId: await this.client.ContentObjectLibraryId({objectId: stream.objectId}),
        objectId: stream.objectId,
        rep: UrlJoin(`/playout/default/${playoutMethod}`, path),
        queryParams: Object.fromEntries(searchParams),
        noAuth: true,
        channelAuth: true
      })
    );

    const authToken = url.searchParams.get("authorization");
    url.searchParams.delete("authorization");

    return await fetch(
      url,
      { headers: { Authorization: `Bearer ${authToken}`}}
    );
  }

  FetchStreamFrameURL = flow(function * (slug) {
    try {
      const stream = this.streams[slug];

      if(!stream) {
        return;
      }

      const playlist = yield(yield this.FetchVideoPath(stream, "playlist.m3u8")).text();

      let lowestBitratePath = playlist
        .split("\n")
        .filter(line => line.startsWith("video/video"))
        .reverse()[0];

      if(!lowestBitratePath) {
        return;
      }

      const segmentPlaylist = yield(yield this.FetchVideoPath(stream, lowestBitratePath)).text();

      if(!segmentPlaylist) {
        return;
      }

      const initSegmentPath = segmentPlaylist
        .split("\n")
        .filter(line => line.includes("init.m4s"))[0]
        .split("\"")[1].replaceAll("\"", "");

      const segmentPath = segmentPlaylist
        .split("\n")
        .filter(line => /^.*\.m4s/.test(line))
        .reverse()[0];

      const segmentBasePath = lowestBitratePath
        .split("?")[0]
        .split("/").slice(0, -1)
        .join("/");

      const [videoInitSegment, videoSegment] = yield Promise.all([
        this.FetchVideoPath(
          stream,
          UrlJoin(segmentBasePath, initSegmentPath)
        ),
        this.FetchVideoPath(
          stream,
          UrlJoin(segmentBasePath, segmentPath)
        )
      ]);

      const url = URL.createObjectURL(
        new Blob([
          yield videoInitSegment.arrayBuffer(),
          yield videoSegment.arrayBuffer()
        ])
      );

      this.streamFrameUrls[slug] = {
        ...this.streamFrameUrls[slug],
        url
      };

      return url;
    } catch(error) {
      /* eslint-disable no-console */
      console.error("Error fetching frame for " + slug);
      console.error(error);
      /* eslint-disable no-console */
      return;
    } finally {
      console.timeEnd(`Load Frame: ${slug}`);
    }
  });

  StreamFrameURL = flow(function * (slug) {
    const existingUrl = this.streamFrameUrls[slug];

    if(existingUrl && Date.now() - existingUrl.timestamp < 60000) {
      return yield existingUrl.url;
    } else if(existingUrl) {
      URL.revokeObjectURL(yield existingUrl.url);
    }

    this.streamFrameUrls[slug] = {
      timestamp: Date.now(),
      promise: this.FetchStreamFrameURL(slug)
    };

    const url = yield this.streamFrameUrls[slug].promise;

    if(!url) {
      // URL not found - remove cache
      delete this.streamFrameUrls[slug];
    }

    return url;
  });

  RemoveWatermark = flow(function * ({
    objectId,
    slug,
    types,
    writeToken,
    finalize
  }) {
    yield this.client.StreamRemoveWatermark({
      objectId,
      types,
      writeToken,
      finalize
    });

    const updateValue = {};

    types.forEach(type => {
      if(type === "image") {
        updateValue.imageWatermark = undefined;
      } else if(type === "text") {
        updateValue.simpleWatermark = undefined;
      } else if(type === "forensic") {
        updateValue.forensicWatermark = undefined;
      }
    });

    this.UpdateStream({
      key: slug,
      value: updateValue
    });
  });

  AddWatermark = flow(function * ({
    objectId,
    slug,
    textWatermark,
    imageWatermark,
    forensicWatermark,
    finalize=true,
    writeToken
  }){
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({objectId, libraryId}));
    }

    const payload = {
      objectId,
      writeToken,
      finalize: false
    };

    if(imageWatermark) {
      payload["imageWatermark"] = imageWatermark;
    } else if(textWatermark) {
      payload["simpleWatermark"] = textWatermark;
    } else if(forensicWatermark) {
      payload["forensicWatermark"] = forensicWatermark;
    }

    const response = yield this.client.StreamAddWatermark(payload);

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Set watermark"
      });
    }

    if(response) {
      this.UpdateStream({
        key: slug,
        value: {
          imageWatermark: response.imageWatermark,
          simpleWatermark: response.textWatermark,
          forensicWatermark: response.forensicWatermark
        }
      });
    }
  });

  WatermarkConfiguration = flow(function * ({
    textWatermark,
    imageWatermark,
    forensicWatermark,
    existingTextWatermark,
    existingImageWatermark,
    existingForensicWatermark,
    watermarkType,
    libraryId,
    objectId,
    slug,
    writeToken,
    finalize=true
  }) {
    const removeTypes = [];
    const payload = {
      objectId,
      slug
    };

    if(existingTextWatermark && !textWatermark) {
      removeTypes.push("text");
    } else if(textWatermark) {
      payload["textWatermark"] = textWatermark ? JSON.parse(textWatermark) : null;
    }

    if(existingImageWatermark && !imageWatermark) {
      removeTypes.push("image");
    } else if(imageWatermark) {
      payload["imageWatermark"] = imageWatermark ? JSON.parse(imageWatermark) : null;
    }

    if(existingForensicWatermark && !forensicWatermark) {
      removeTypes.push("forensic");
    } else if(forensicWatermark) {
      payload["forensicWatermark"] = forensicWatermark ? JSON.parse(forensicWatermark) : null;
    }

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({objectId, libraryId}));
    }

    if(imageWatermark || textWatermark || forensicWatermark) {
      yield this.AddWatermark({...payload,
        writeToken,
        finalize: false
      });
    }

    if(removeTypes.length > 0) {
      yield this.RemoveWatermark({
        objectId,
        slug,
        writeToken,
        finalize: false,
        types: removeTypes
      });
    }

    let updateValue = {};
    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Configure watermark"
      });

      const statusResponse = yield this.CheckStatus({
        objectId
      });

      updateValue["status"] = statusResponse.state;
    } else {
      updateValue["watermarkType"] = watermarkType;
    }

    this.UpdateStream({
      key: slug,
      value: updateValue
    });
  });

  DrmConfiguration = flow(function * ({
    libraryId,
    objectId,
    slug,
    drmType,
    existingDrmType,
    writeToken,
    status,
    finalize=true
  }) {
    if(existingDrmType === drmType) { return; }

    const drmOption = ENCRYPTION_OPTIONS.find(option => option.value === drmType);

    libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        objectId,
        libraryId
      }));
    }

    yield this.client.ReplaceMetadata({
      objectId,
      libraryId,
      writeToken,
      metadataSubtree: "live_recording_config/drm",
      metadata: drmType.includes("drm") ? "drm" : drmType.includes("clear") ? "clear" : undefined,
    });

    yield this.client.ReplaceMetadata({
      objectId,
      libraryId,
      writeToken,
      metadataSubtree: "live_recording_config/drm_type",
      metadata: drmType
    });

    let updateValue = {}, drmNeedsInit = false;

    if(![STATUS_MAP.UNINITIALIZED, STATUS_MAP.UNCONFIGURED].includes(status)) {
      yield this.client.StreamInitialize({
        name: objectId,
        drm: drmType === "clear" ? false : true,
        format: drmOption.format.join(","),
        writeToken,
        finalize: false
      });
    }

    if(finalize) {
      yield this.client.FinalizeContentObject({
        objectId,
        libraryId,
        writeToken,
        commitMessage: "Update drm type metadata"
      });

      const statusResponse = yield this.CheckStatus({
        objectId
      });

      updateValue["status"] = statusResponse.state;
    } else {
      updateValue["drm"] = drmType;
      drmNeedsInit = true;
    }

    this.UpdateStream({
      key: slug,
      value: updateValue
    });

    return {
      drmNeedsInit,
      drmInitPayload: {
        name: objectId,
        drm: drmType === "clear" ? false : true,
        format: drmOption.format.join(",")
      }
    };
  });

  UpdateAudioLadderSpecs = flow(function * ({
    objectId,
    libraryId,
    writeToken,
    ladderSpecs,
    audioData,
    edit=false
  }) {
    let globalAudioBitrate = 0;
    let nAudio = 0;
    const audioLadderSpecs = [];

    if(!audioData) {
      audioData = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config/audio"
      });
    }

    const audioIndexMeta = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];

    const audioStreams = this.CreateAudioStreamsConfig({audioData});
    Object.keys(audioStreams || {}).forEach((stream, i) => {
      let audioLadderSpec = {};
      const audioIndex = Object.keys(audioStreams)[i];
      const audio = audioStreams[audioIndex];

      audioIndexMeta[i] = parseInt(Object.keys(audioStreams || {})[i]);

      if(!audioData[audioIndex].record) { return; }

      for(let j = 0; j < ladderSpecs.audio.length; j++) {
        let element = ladderSpecs.audio[j];
        if(element.channels === audio.recordingChannels) {
          audioLadderSpec = {...element};
          break;
        }
      }

      if(Object.keys(audioLadderSpec).length === 0) {
        audioLadderSpec = {...ladderSpecs.audio[0]};
      }

      audioLadderSpec.representation = `audioaudio_aac@${audioLadderSpec.bit_rate}`;
      audioLadderSpec.channels = audio.recordingChannels;
      audioLadderSpec.stream_index = parseInt(audioIndex);
      audioLadderSpec.stream_name = `audio_${audioIndex}`;
      audioLadderSpec.stream_label = audioData[audioIndex].playout ? audioData[audioIndex].playout_label : null;
      audioLadderSpec.media_type = 2;
      audioLadderSpec.lang = audioData[audioIndex].lang;
      // audioLadderSpec.default = Object.hasOwn(correspondingLadderSpec, "default") ? correspondingLadderSpec.default : audioData[audioIndex].default;

      // Set default audio stream if only ONLY exists
      if(Object.keys(audioStreams).length === 1 && !edit) {
        audioLadderSpec.default = true;
      } else {
        audioLadderSpec.default = audioData[audioIndex].default;
      }

      audioLadderSpecs.push(audioLadderSpec);

      if(audio.recordingBitrate > globalAudioBitrate) {
        globalAudioBitrate = audio.recordingBitrate;
      }

      nAudio++;
    });

    return {
      nAudio,
      globalAudioBitrate,
      audioLadderSpecs,
      audioIndexMeta
    };
  });

  UpdateLadderSpecs = flow(function * ({
    objectId,
    libraryId,
    profile="",
    writeToken,
    finalize=true
  }) {
    let profileData;
    let topLadderRate = 0;
    let ladderSpecs = [];

    if(!libraryId) {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    const ladderProfiles = yield this.rootStore.dataStore.LoadLadderProfiles();

    let audioData = yield this.client.ContentObjectMetadata({
      libraryId,
      objectId,
      metadataSubtree: "live_recording_config/audio"
    });

    if(!audioData || Object.keys(audioData || {}).length === 0) {
      ({audioData} = yield this.rootStore.dataStore.LoadStreamProbeData({
        objectId
      }));
    }

    if(!ladderProfiles) {
      throw Error("Unable to update ladder specs. No profiles were found.");
    }

    if(!!profile && profile.toLowerCase() !== "default") {
      profileData = ladderProfiles.custom.find(item => item.name === profile);
    } else {
      profileData = ladderProfiles.default;
    }

    // Add fully-formed video specs
    profileData.ladder_specs.video.forEach(spec => {
      if(spec.bit_rate > topLadderRate) {
        topLadderRate = spec.bit_rate;
      }

      const videoSpec = {
        ...spec,
        media_type: 1,
        representation: `videovideo_${spec.width}x${spec.height}_h264@${spec.bit_rate}`,
        stream_index: 0,
        stream_name: "video"
      };

      ladderSpecs.push(videoSpec);
    });

    const {nAudio, globalAudioBitrate, audioLadderSpecs, audioIndexMeta} = yield this.UpdateAudioLadderSpecs({
      libraryId,
      objectId,
      ladderSpecs: profileData.ladder_specs,
      audioData
    });

    ladderSpecs = ladderSpecs.concat(audioLadderSpecs);

    yield this.client.MergeMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording/recording_config/recording_params/xc_params",
      metadata: {
        audio_bitrate: globalAudioBitrate,
        video_bitrate: topLadderRate,
        n_audio: nAudio
      }
    });

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording/recording_config/recording_params/ladder_specs",
      metadata: ladderSpecs
    });

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording/recording_config/recording_params/xc_params/audio_index",
      metadata: audioIndexMeta
    });

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Update ladder_specs"
      });
    }
  });

  FetchLiveRecordingCopies = flow(function * ({objectId, libraryId}) {
    if(!libraryId) {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    return this.client.ContentObjectMetadata({
      objectId,
      libraryId,
      metadataSubtree: "live_recording_copies"
    });
  });

  DeleteLiveRecordingCopy = flow(function * ({streamId, recordingCopyId}) {
    const liveRecordingCopies = yield this.FetchLiveRecordingCopies({objectId: streamId});

    delete liveRecordingCopies[recordingCopyId];

    const libraryId = yield this.client.ContentObjectLibraryId({objectId: streamId});
    const {writeToken} = yield this.client.EditContentObject({
      objectId: streamId,
      libraryId
    });

    yield this.client.ReplaceMetadata({
      objectId: streamId,
      libraryId,
      writeToken,
      metadataSubtree: "live_recording_copies",
      metadata: liveRecordingCopies
    });

    const response = yield this.client.FinalizeContentObject({
      objectId: streamId,
      libraryId,
      writeToken,
      commitMessage: "Remove live recording copy"
    });

    return response;
  });

  CopyToVod = flow(function * ({
    objectId,
    targetLibraryId,
    accessGroup,
    selectedPeriods=[],
    title
  }) {
    let recordingPeriod, startTime, endTime;
    // Used to save start and end times in stream object meta
    const timeSeconds = {};
    const firstPeriod = selectedPeriods[0];
    const currentDateTime = new Date();

    if(selectedPeriods.length > 1) {
      // Multiple periods
      const lastPeriod = selectedPeriods[selectedPeriods.length - 1];
      recordingPeriod = null;
      startTime = new Date(firstPeriod?.start_time_epoch_sec * 1000).toISOString();
      endTime = new Date(lastPeriod?.end_time_epoch_sec * 1000).toISOString();

      timeSeconds.startTime = firstPeriod?.start_time_epoch_sec;
      timeSeconds.endTime = lastPeriod?.end_time_epoch_sec;
    } else {
      // Specific period
      recordingPeriod = firstPeriod.id;
      timeSeconds.startTime = firstPeriod?.start_time_epoch_sec;
      timeSeconds.endTime = firstPeriod?.end_time_epoch_sec;
    }

    if(!timeSeconds.endTime) {
      timeSeconds.endTime = Math.floor(currentDateTime.getTime() / 1000);
    }

    // Create content object
    const titleType = this.rootStore.dataStore.titleContentType;

    if(!targetLibraryId) {
      targetLibraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    const streamSlug = Object.keys(this.streams || {}).find(slug => (
      this.streams[slug].objectId === objectId
    ));
    const targetTitle = title || `${this.streams[streamSlug]?.title || objectId} VoD`;

    const createResponse = yield this.client.CreateContentObject({
      libraryId: targetLibraryId,
      options: titleType ?
        {
          type: titleType,
          meta: {
            public: {
              name: targetTitle
            }
          }
        } :
        {}
    });
    const targetObjectId = createResponse.id;

    try {
      yield this.client.FinalizeContentObject({
        libraryId: targetLibraryId,
        objectId: targetObjectId,
        writeToken: createResponse.writeToken,
        awaitCommitConfirmation: true,
        commitMessage: "Create VoD object"
      });
    } catch(error) {
      console.error("Failed to finalize object", error);
      throw error;
    }

    // Set editable permission
    try {
      yield this.client.SetPermission({
        objectId: targetObjectId,
        permission: "editable"
      });
    } catch(error) {
      console.error("Failed to set permission", error);
      throw error;
    }

    if(accessGroup) {
      this.rootStore.streamManagementStore.AddAccessGroupPermission({
        objectId: targetObjectId,
        groupName: accessGroup
      });
    }

    let response;
    try {
      response = yield this.client.StreamCopyToVod({
        name: objectId,
        targetObjectId,
        recordingPeriod,
        startTime,
        endTime
      });
    } catch(error) {

      console.error("Unable to copy to VoD.", error);
      throw error(error);
    }

    if(!response) {
      throw Error("Unable to copy to VoD. Is part available?");
    } else if(response) {
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});
      const {writeToken} = yield this.client.EditContentObject({
        objectId,
        libraryId
      });

      let copiesMetadata = yield this.client.ContentObjectMetadata({
        objectId,
        libraryId,
        metadataSubtree: "live_recording_copies"
      });

      if(!copiesMetadata) {
        copiesMetadata = {};
      }

      copiesMetadata[targetObjectId] = {
        startTime: timeSeconds.startTime,
        endTime: timeSeconds.endTime,
        create_time: currentDateTime.getTime(),
        title: targetTitle
      };

      yield this.client.ReplaceMetadata({
        objectId,
        libraryId,
        writeToken,
        metadataSubtree: "/live_recording_copies",
        metadata: copiesMetadata
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        awaitCommitConfirmation: true,
        commitMessage: "Update live recording copies"
      });

      return response;
    }
  });

  CreateAudioStreamsConfig = ({audioData={}}) => {
    let audioStreams = {};

    for(let i = 0; i < Object.keys(audioData || {}).length; i++) {
      const audioIndex = Object.keys(audioData || {})[i];
      const audio = audioData[audioIndex];

      audioStreams[audioIndex] = {
        recordingBitrate: audio.recording_bitrate || 192000,
        recordingChannels: audio.recording_channels || 2
      };

      if(audio.playout) {
        audioStreams[audioIndex].playoutLabel = audio.playout_label || `Audio ${audioIndex}`;
      }
    }

    return audioStreams;
  };

  UpdateStreamAudioSettings = flow(function * ({objectId, writeToken, finalize=true, audioData, edit=false}) {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config/audio",
      metadata: audioData
    });

    const ladderSpecsPath = "live_recording/recording_config/recording_params/ladder_specs";
    const ladderSpecsMeta = yield this.client.ContentObjectMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: ladderSpecsPath
    });

    const filteredAudioData = {...audioData};

    Object.keys(filteredAudioData || {}).forEach(index => {
      if(!filteredAudioData[index].record) {
        delete filteredAudioData[index];
      }
    });

    const {nAudio, globalAudioBitrate, audioLadderSpecs, audioIndexMeta} = yield this.UpdateAudioLadderSpecs({
      libraryId,
      objectId,
      writeToken,
      ladderSpecs: {audio: ladderSpecsMeta},
      audioData: filteredAudioData,
      edit
    });

    const videoLadderSpecs = (ladderSpecsMeta || []).filter(spec => spec.stream_name.includes("video"));

    const newLadderSpecs = [
      ...videoLadderSpecs,
      ...audioLadderSpecs
    ];

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: ladderSpecsPath,
      metadata: newLadderSpecs
    });

    yield this.client.MergeMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording/recording_config/recording_params/xc_params",
      metadata: {
        audio_bitrate: globalAudioBitrate,
        n_audio: nAudio
      }
    });

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording/recording_config/recording_params/xc_params/audio_index",
      metadata: audioIndexMeta
    });

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Update audio settings",
        awaitCommitConfirmation: true
      });
    }
  });

  SyncAudioToProbe = flow(function * ({libraryId, objectId, writeToken, finalize=true}) {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const liveRecordingMetadata = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config",
        select: [
          "probe_info/streams",
          "audio"
        ]
      });

      const audioConfig = liveRecordingMetadata?.audio || {};
      const probeAudioStreams = (liveRecordingMetadata?.probe_info?.streams || [])
        .filter(stream => stream.codec_type === "audio");
      const audioIndexes = probeAudioStreams.map(stream => stream.stream_index);

      probeAudioStreams.forEach((stream, i) => {
        const currentAudioSetting = audioConfig[stream.stream_index];

        // Corresponding audio setting exists for that index
        if(currentAudioSetting) {
          currentAudioSetting.bitrate = stream.bit_rate;
          currentAudioSetting.codec = stream.codec_name;
          currentAudioSetting.recording_channels = stream.channels;

          // Special case to handle a single audio stream. If
          // record = false, the video won't start
          if(probeAudioStreams.length === 1) {
            currentAudioSetting.record = true;
          }
        } else {
        // Audio index doesn't exist. Add to spec
          audioConfig[stream.stream_index] = {
            bitrate: stream.bit_rate,
            codec: stream.codec_name,
            playout: true,
            playout_label: `Audio ${i + 1}`,
            record: true,
            recording_bitrate: 192000,
            recording_channels: stream.channels
          };
        }

        // Delete audio specs that do not exist in probe
        const audioToDelete = [];
        Object.keys(audioConfig || {}).forEach(index => {
          if(!audioIndexes.includes(parseInt(index))) {
            audioToDelete.push(index);
          }
        });

        audioToDelete.forEach(index => delete audioConfig[index]);
      });

      yield this.UpdateStreamAudioSettings({
        objectId,
        audioData: audioConfig,
        writeToken,
        finalize
      });
    } catch(error) {

      console.error("Unable to sync audio settings to probe data", error);
    }
  });
}

export default StreamBrowseStore;
