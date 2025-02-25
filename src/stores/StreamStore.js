// Force strict mode so mutations are only allowed within actions.
import {configure, flow, makeAutoObservable} from "mobx";
import {editStore} from "./index";
import UrlJoin from "url-join";
import {dataStore} from "./index";
import {FileInfo} from "@/utils/helpers";
import {ENCRYPTION_OPTIONS} from "@/utils/constants";

configure({
  enforceActions: "always"
});

// Store for all stream-related actions
class StreamStore {
  streams;
  streamFrameUrls = {};
  showMonitorPreviews = false;
  loadingStatus = false;

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

  ConfigureStream = flow(function * ({
    objectId,
    slug,
    probeMetadata
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
          "drm",
          "drm_type",
          "audio",
          "playout_ladder_profile"
        ]
      });

      const recordingConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/recording_config",
        select: [
          "recording_params/xc_params/connection_timeout",
          "recording_params/reconnect_timeout"
        ]
      });

      const customSettings = {};

      const edgeWriteToken = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/fabric_config/edge_write_token"
      });

      // Config api will override meta containing edge write token
      if(edgeWriteToken) {
        customSettings["edge_write_token"] = edgeWriteToken;
      }

      if(liveRecordingConfig.part_ttl) {
        customSettings["part_ttl"] = liveRecordingConfig.part_ttl;
      }

      if(recordingConfig?.recording_params?.xc_params?.connection_timeout) {
        customSettings["connection_timeout"] = recordingConfig.recording_params.xc_params.connection_timeout;
      }

      if(recordingConfig?.recording_params?.reconnect_timeout) {
        customSettings["reconnect_timeout"] = recordingConfig.recording_params.reconnect_timeout;
      }

      if(liveRecordingConfig.playout_ladder_profile) {
        const allProfiles = yield this.client.ContentObjectMetadata({
          libraryId: yield this.client.ContentObjectLibraryId({objectId: dataStore.siteId}),
          objectId: dataStore.siteId,
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
            customSettings["ladder_profile"] = profileData.ladder_specs;
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

      customSettings["audio"] = liveRecordingConfig.audio ? liveRecordingConfig.audio : undefined;

      yield this.client.StreamConfig({name: objectId, customSettings, probeMetadata});

      if((liveRecordingConfig?.drm_type || "").includes("drm")) {
        const drmOption = liveRecordingConfig?.drm_type ? ENCRYPTION_OPTIONS.find(option => option.value === liveRecordingConfig.drm_type) : null;

        // Check for existing drm keys; if found, skip Stream Initialize
        const drmKeyMeta = yield this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "offerings/default/playout/drm_keys"
        });

        if(!drmKeyMeta) {
          yield this.client.StreamInitialize({
            name: objectId,
            drm: liveRecordingConfig?.drm === "clear" ? false : true,
            format: drmOption?.format.join(",")
          });
        }
      }

      // Update stream link in site after stream configuration
      yield editStore.UpdateStreamLink({objectId, slug});

      const response = yield this.CheckStatus({
        objectId
      });

      const streamDetails = yield dataStore.LoadStreamMetadata({
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
    stopLro=false,
    showParams=false,
    update=false
  }) {
    let response;
    try {
      response = yield this.client.StreamStatus({
        name: objectId,
        stopLro,
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
      yield this.client.StreamCreate({name: objectId, start});
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

      this.UpdateStream({key: slug, value: { status: response.state }});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to ${OP_MAP[operation]} LRO.`, error);
    }
  });

  DeactivateStream = flow(function * ({objectId, slug}) {
    try {
      const response = yield this.client.StreamStopSession({name: objectId});

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
    types
  }) {
    yield this.client.StreamRemoveWatermark({
      objectId,
      types,
      finalize: true
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
    imageWatermarkFile,
    forensicWatermark
  }){
    const payload = {
      objectId,
      finalize: true
    };

    if(imageWatermarkFile) {
      const fileInfo = yield FileInfo({path: "", fileList: [imageWatermarkFile]});

      const libraryId = yield this.client.ContentObjectLibraryId({objectId});
      const {writeToken} = yield this.client.EditContentObject({objectId, libraryId});

      yield this.client.UploadFiles({
        libraryId,
        objectId,
        writeToken,
        fileInfo
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Upload image"
      });

      const imageWatermark = {
        "align_h": "right",
        "align_v": "top",
        "image": {
          "/": `./files/${fileInfo?.[0].path}`
        },
        "margin_h": null,
        "margin_v": null,
        "target_video_height": 1080
      };

      payload["imageWatermark"] = imageWatermark;
    } else if(textWatermark) {
      payload["simpleWatermark"] = textWatermark;
    } else if(forensicWatermark) {
      payload["forensicWatermark"] = forensicWatermark;
    }

    const response = yield this.client.StreamAddWatermark(payload);

    this.UpdateStream({
      key: slug,
      value: {
        imageWatermark: response.imageWatermark,
        simpleWatermark: response.textWatermark,
        forensicWatermark: response.forensicWatermark
      }
    });
  });

  WatermarkConfiguration = flow(function * ({
    textWatermark,
    imageWatermark,
    forensicWatermark,
    existingTextWatermark,
    existingImageWatermark,
    existingForensicWatermark,
    watermarkType,
    objectId,
    slug
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
      payload["imageWatermarkFile"] = imageWatermark;
    }

    if(existingForensicWatermark && !forensicWatermark) {
      removeTypes.push("forensic");
    } else if(forensicWatermark) {
      payload["forensicWatermark"] = forensicWatermark ? JSON.parse(forensicWatermark) : null;
    }

    if(imageWatermark || textWatermark || forensicWatermark) {
      yield this.AddWatermark(payload);
    }

    if(removeTypes.length > 0) {
      yield this.RemoveWatermark({
        objectId,
        slug,
        types: removeTypes
      });
    }

    const statusResponse = yield this.CheckStatus({
      objectId
    });

    this.UpdateStream({
      key: slug,
      value: {
        status: statusResponse.state,
        watermarkType
      }
    });
  });

  DrmConfiguration = flow(function * ({
    objectId,
    slug,
    drmType,
    existingDrmType
  }) {
    if(existingDrmType === drmType) { return; }

    const drmOption = ENCRYPTION_OPTIONS.find(option => option.value === drmType);

    const libraryId = yield this.client.ContentObjectLibraryId({objectId});
    const {writeToken} = yield this.client.EditContentObject({
      objectId,
      libraryId
    });

    yield this.client.ReplaceMetadata({
      objectId,
      libraryId,
      writeToken,
      metadataSubtree: "live_recording_config/drm_type",
      metadata: drmType
    });

    yield this.client.FinalizeContentObject({
      objectId,
      libraryId,
      writeToken,
      commitMessage: "Update drm type metadata"
    });

    const response = yield this.client.StreamInitialize({
      name: objectId,
      drm: drmType === "clear" ? false : true,
      format: drmOption.format.join(",")
    });

    const statusResponse = yield this.CheckStatus({
      objectId
    });

    if(response) {
      this.UpdateStream({
        key: slug,
        value: {
          status: statusResponse.state,
          drm: drmType
        }
      });
    }
  });

  UpdateAudioLadderSpecs = flow(function * ({objectId, libraryId, ladderSpecs, audioData}) {
    let globalAudioBitrate = 0;
    let nAudio = 0;
    const audioLadderSpecs = [];

    if(!audioData) {
      audioData = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
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
      audioLadderSpec.default = audioData[audioIndex].default;

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

  UpdateLadderSpecs = flow(function * ({objectId, libraryId, profile=""}) {
    let profileData;
    let topLadderRate = 0;
    let ladderSpecs = [];

    if(!libraryId) {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId
    });

    const ladderProfiles = yield dataStore.LoadLadderProfiles();

    let audioData = yield this.client.ContentObjectMetadata({
      libraryId,
      objectId,
      metadataSubtree: "live_recording_config/audio"
    });

    if(!audioData) {
      ({audioData} = yield dataStore.LoadStreamProbeData({
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

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Update ladder_specs",
      awaitCommitConfirmation: true
    });
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
    const titleType = dataStore.titleContentType;

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

    if(accessGroup) {
      editStore.AddAccessGroupPermission({
        objectId: targetObjectId,
        groupName: accessGroup
      });
    }

    // Set editable permission
    yield this.client.SetPermission({
      objectId: targetObjectId,
      permission: "editable",
      writeToken: createResponse.writeToken
    });

    yield this.client.FinalizeContentObject({
      libraryId: targetLibraryId,
      objectId: targetObjectId,
      writeToken: createResponse.writeToken,
      awaitCommitConfirmation: true,
      commitMessage: "Create VoD object"
    });

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

  UpdateStreamAudioSettings = flow(function * ({objectId, audioData}) {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});
    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId
    });

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
      ladderSpecs: {audio: ladderSpecsMeta},
      audioData: filteredAudioData
    });

    const videoLadderSpecs = ladderSpecsMeta.filter(spec => spec.stream_name.includes("video"));

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

    // const audioStreams = this.CreateAudioStreamsConfig({audioData});
    // const audioIndexMeta = [];
    //
    // for(let i =0; i < Object.keys(audioStreams).length; i ++) {
    //   audioIndexMeta[i] = parseInt(Object.keys(audioStreams || {})[i]);
    // }
    //
    // yield this.client.ReplaceMetadata({
    //   libraryId,
    //   objectId,
    //   writeToken,
    //   metadataSubtree: "live_recording/recording_config/recording_params/xc_params/audio_index",
    //   metadata: audioIndexMeta
    // });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Update audio settings",
      awaitCommitConfirmation: true
    });
  });
}

export default StreamStore;
