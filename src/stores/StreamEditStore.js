// Handles stream configuration writes: create, delete, metadata, recording config, playout (watermarks, DRM, audio), profiles, permissions, and VOD copy.
import {flow, makeAutoObservable, toJS} from "mobx";
import {ParseLiveConfigData} from "@/utils/helpers.js";
import {STATUS_MAP} from "@/utils/constants.js";
import {slugify} from "@eluvio/elv-client-js/utilities/lib/helpers.js";

class StreamEditStore {
  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }

  // Stream Lifecycle

  CreateContentObject = flow(function * ({
    libraryId
  }) {
    let response;
    try {
      response = yield this.client.CreateContentObject({
        libraryId,
        options: { type: this.rootStore.dataStore.contentType }
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create content object.", error);
    }

    return response;
  });

  /**
   * Creates a new live stream content object and registers it in the stream store.
   */
  InitLiveStreamObject = flow(function * ({
    objectId,
    accessGroup,
    description,
    displayTitle,
    encryption,
    libraryId,
    name,
    nodeId,
    permission,
    configProfile,
    retention,
    persistent,
    url
  }) {
    try {
      const config = ParseLiveConfigData({
        encryption,
        configProfile,
        retention,
        persistent
      });

      const groupAddress = this.rootStore.dataStore.accessGroups[accessGroup]?.address;

      const response = yield this.client.StreamCreate({
        libraryId,
        objectId,
        url,
        liveRecordingConfig: config,
        options: {
          accessGroups: groupAddress ? [groupAddress] : undefined,
          displayTitle,
          description,
          ingressNodeId: nodeId,
          linkToSite: true,
          name,
          permission
        }
      });

      const createdObjectId = response.objectId;

      const statusResponse = yield this.rootStore.streamStore.CheckStatus({
        objectId: createdObjectId
      });

      const streamValue = {
        objectId: createdObjectId,
        title: name,
        status: statusResponse.state,
      };

      const streamDetails = yield this.rootStore.streamStore.LoadStreamMetadata({
        objectId: createdObjectId,
        libraryId
      }) || {};

      Object.keys(streamDetails).forEach(detail => {
        streamValue[detail] = streamDetails[detail];
      });

      this.rootStore.streamStore.UpdateStream({
        key: slugify(name),
        value: streamValue
      });

      return {
        objectId: createdObjectId,
        slug: slugify(name)
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create stream", error);
      throw error;
    }
  });

  DuplicateStream = flow(function * ({
    libraryId,
    originalVersionHash,
    originalSlug,
    name,
    url,
    nodeId
  }) {
    try {
      const originalStream = this.rootStore.streamStore.streams[originalSlug];
      const targetTitle = name ?? `Copy ${originalStream?.name}`;

      if(!libraryId) {
        // Set target library to same as original object
        libraryId = yield this.client.ContentObjectLibraryId({objectId: originalStream.objectId});
      }

      const response = yield this.client.CopyContentObject({
        libraryId,
        originalVersionHash: originalVersionHash || originalStream?.versionHash,
        options: {
          type: this.rootStore.dataStore.titleContentType,
          meta: {
            public: {
              name: targetTitle
            }
          }
        }
      });

      const options = {
        linkToSite: true,
        name: targetTitle
      };

      if(nodeId) { options["ingressNodeId"] = nodeId; }

      yield this.client.StreamCreate({
        libraryId,
        objectId: response.id,
        url,
        options
      });


      const statusResponse = yield this.rootStore.streamStore.CheckStatus({
        objectId: response.id
      });

      const streamValue = {
        objectId: response.id,
        title: targetTitle,
        status: statusResponse.state,
      };

      const streamDetails = yield this.rootStore.streamStore.LoadStreamMetadata({
        objectId: response.id,
        libraryId
      }) || {};

      Object.keys(streamDetails).forEach(detail => {
        streamValue[detail] = streamDetails[detail];
      });

      this.rootStore.streamStore.UpdateStream({
        key: slugify(targetTitle),
        value: streamValue
      });

      return response;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to copy stream", error);
      throw error;
    }
  });

  DeleteStream = flow(function * ({objectId, slug}) {
    const streams = Object.assign({}, this.rootStore.streamStore.streams);

    if(!slug) {
      slug = Object.keys(streams).find(streamSlug => {
        return streams[streamSlug].objectId === objectId;
      });
    }

    yield this.client.StreamRemoveLinkToSite({objectId, slug});

    try {
      yield this.client.DeleteContentObject({
        libraryId: yield this.client.ContentObjectLibraryId({objectId}),
        objectId
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.log(`Content object ${objectId} has already been deleted. Removed from the site object.`);
    }

    delete streams[slug];
    this.rootStore.streamStore.UpdateStreams({streams});
  });

  DeleteStreamBatch = flow(function * ({objects}) {
    const streams = Object.assign({}, this.rootStore.streamStore.streams);

    const resolved = objects.map(object => ({
      objectId: object.objectId,
      slug: object.slug ?? Object.keys(streams).find(slug => streams[slug].objectId === object.objectId)
    }));

    const {writeToken} = yield this.client.EditContentObject({
      libraryId: this.rootStore.dataStore.siteLibraryId,
      objectId: this.rootStore.dataStore.siteId
    });

    for(const {objectId, slug} of resolved) {
      yield this.client.StreamRemoveLinkToSite({objectId, slug, writeToken, finalize: false});

      try {
        yield this.client.DeleteContentObject({
          libraryId: yield this.client.ContentObjectLibraryId({objectId}),
          objectId
        });
      } catch(error) {
        // eslint-disable-next-line no-console
        console.log(`Content object ${objectId} has already been deleted. Removed from the site object.`);
      }

      delete streams[slug];
    }

    yield this.client.FinalizeContentObject({
      libraryId: this.rootStore.dataStore.siteLibraryId,
      objectId: this.rootStore.dataStore.siteId,
      writeToken,
      commitMessage: "Remove live streams",
      awaitCommitConfirmation: true
    });

    this.rootStore.streamStore.UpdateStreams({streams});
  });

  // Permissions & Access

  SetPermission = flow(function * ({objectId, permission}) {
    try {
      const response = yield this.client.SetPermission({
        objectId,
        permission
      });

      yield new Promise(resolve => setTimeout(resolve, 1000));

      return response;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to set permission.", error);
    }
  });

  AddAccessGroupPermission = flow(function * ({
    objectId,
    groupName,
    groupAddress
  }) {
    try {
      if(!groupAddress) {
        groupAddress = this.rootStore.dataStore.accessGroups[groupName]?.address;
      }

      yield this.client.AddContentObjectGroupPermission({
        objectId,
        groupAddress,
        permission: "manage"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to add group permission for group: ${groupName || groupAddress}`, error);
    }
  });

  RemoveAccessGroupPermission = ({
    objectId,
    groupAddress
  }) => {
    try {
      return this.client.RemoveContentObjectGroupPermission({
        objectId,
        groupAddress,
        permission: "manage"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to remove group permission for group: ${groupAddress}`, error);
    }
  };

  UpdateAccessGroupPermission = flow(function * ({objectId, addGroup, removeGroup}) {
    if(removeGroup) {
      yield this.RemoveAccessGroupPermission({
        objectId,
        groupAddress: removeGroup
      });
    }

    if(addGroup) {
      yield this.AddAccessGroupPermission({
        objectId,
        groupAddress: addGroup
      });
    }
  });

  // Metadata Writes

  AddMetadata = flow(function * ({
    libraryId,
    objectId,
    writeToken,
    config,
    name,
    description,
    displayTitle,
    finalize=true
  }) {
    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    yield this.client.MergeMetadata({
      libraryId,
      objectId,
      writeToken,
      metadata: {
        public: {
          name,
          description,
          asset_metadata: {
            display_title: displayTitle || name,
            title: name || displayTitle,
            title_type: "live_stream",
            video_type: "live",
            slug: slugify(name)
          }
        },
        "live_recording_config": config
      }
    });

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Add metadata",
        awaitCommitConfirmation: true
      });
    }
  });

  UpdateDetailMetadata = flow(function * ({
    libraryId,
    objectId,
    writeToken,
    finalize=true,
    name,
    url,
    description,
    displayTitle,
    slug
  }) {
    try {
      const updateValue = {};

      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      if(!writeToken) {
        ({writeToken} = yield this.client.EditContentObject({
          libraryId,
          objectId
        }));
      }

      const metadata = {
        public: {
          asset_metadata: {}
        }
      };

      if(name) {
        metadata.public["name"] = name;
        metadata.public.asset_metadata["title"] = name;
        updateValue["title"] = name;
      }

      if(url) {
        yield this.client.ReplaceMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/origin_url",
          metadata: url
        });

        yield this.client.MergeMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording_config",
          metadata: {
            reference_url: url,
            url
          }
        });
      }

      if(description) {
        metadata.public["description"] = description;
      }

      if(displayTitle) {
        metadata.public.asset_metadata["display_title"] = displayTitle;
      }

      yield this.client.MergeMetadata({
        libraryId,
        objectId,
        writeToken,
        metadata
      });

      let response;
      if(finalize) {
        response = this.client.FinalizeContentObject({
          libraryId,
          objectId,
          writeToken,
          commitMessage: "Update metadata",
          awaitCommitConfirmation: true
        });
      }

      this.rootStore.streamStore.UpdateStream({
        key: slug,
        value: updateValue
      });

      return response;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update metadata", error);
    }
  });

  UpdateConfigMetadata = flow(function * ({
    libraryId,
    objectId,
    writeToken,
    finalize=true,
    slug,
    retention,
    persistent,
    connectionTimeout,
    reconnectionTimeout,
    skipDvrSection=false,
    dvrEnabled,
    dvrStartTime,
    dvrMaxDuration,
    copyMpegTs,
    inputPackaging,
    copyMode,
    customReadLoop,
    audioData,
    multiPathEnabled
  }){
    if(!libraryId) {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
    }
    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    const existingConfig = yield this.client.ContentObjectMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config"
    });

    const recordingConfig = {...existingConfig?.recording_config};
    if(retention !== undefined) recordingConfig.part_ttl = parseInt(retention);
    if(persistent !== undefined) recordingConfig.persistent = persistent;
    if(connectionTimeout !== undefined) recordingConfig.connection_timeout = parseInt(connectionTimeout);
    if(reconnectionTimeout !== undefined) recordingConfig.reconnect_timeout = parseInt(reconnectionTimeout);
    if(copyMpegTs !== undefined) {
      recordingConfig.copy_mpegts = copyMpegTs;
      recordingConfig.input_cfg = copyMpegTs ? {
        bypass_libav_reader: true,
        copy_mode: copyMode,
        copy_packaging: inputPackaging,
        custom_read_loop_enabled: customReadLoop,
        input_packaging: inputPackaging
      } : {};
    }

    const recordingStreamConfig = {...existingConfig?.recording_stream_config};
    if(audioData !== undefined) {
      recordingStreamConfig.audio = audioData;
    }

    const playoutConfig = {...existingConfig?.playout_config};
    if(!skipDvrSection && dvrEnabled !== undefined) {
      playoutConfig.dvr = dvrEnabled;
      if(dvrEnabled) {
        if(dvrStartTime != null) { playoutConfig.dvr_start_time = new Date(dvrStartTime).toISOString(); }
        if(dvrMaxDuration != null) { playoutConfig.dvr_max_duration = parseInt(dvrMaxDuration); }
      } else {
        delete playoutConfig.dvr_start_time;
        delete playoutConfig.dvr_max_duration;
      }
    }

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config",
      metadata: {...existingConfig, recording_config: recordingConfig, playout_config: playoutConfig, recording_stream_config: recordingStreamConfig}
    });

    if(retention !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId, objectId, writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/part_ttl",
        metadata: parseInt(retention)
      });
    }

    if(persistent !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId, objectId, writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/persistent",
        metadata: persistent
      });
    }

    if(connectionTimeout !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId, objectId, writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/xc_params/connection_timeout",
        metadata: parseInt(connectionTimeout)
      });
    }

    if(reconnectionTimeout !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId, objectId, writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/reconnect_timeout",
        metadata: parseInt(reconnectionTimeout)
      });
    }

    if(copyMpegTs !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId, objectId, writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/xc_params/copy_mpegts",
        metadata: copyMpegTs
      });
      yield this.client.ReplaceMetadata({
        libraryId, objectId, writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/xc_params/input_cfg",
        metadata: copyMpegTs ? {
          bypass_libav_reader: true,
          copy_mode: copyMode,
          copy_packaging: inputPackaging,
          custom_read_loop_enabled: customReadLoop,
          input_packaging: inputPackaging
        } : {}
      });
    }

    if(multiPathEnabled !== undefined) {
      let multiPathMeta = {enabled: false};
      if(multiPathEnabled) {
        const streamNames = [
          "video",
          ...Object.keys(audioData || {})
            .filter(key => audioData[key].record)
            .map((el) => `audio_${el}`)
        ];
        if(copyMpegTs) { streamNames.push("mpegts"); }
        multiPathMeta = {enabled: true, stream_names: streamNames};
      }
      yield this.client.ReplaceMetadata({
        libraryId, objectId, writeToken,
        metadataSubtree: "live_recording/fabric_config/multipath",
        metadata: multiPathMeta
      });
    }

    if(!skipDvrSection && dvrEnabled !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId, objectId, writeToken,
        metadataSubtree: "live_recording/playout_config/dvr_enabled",
        metadata: dvrEnabled
      });
      if(dvrEnabled) {
        if(dvrStartTime != null) {
          yield this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/playout_config/dvr_start_time",
            metadata: new Date(dvrStartTime).toISOString()
          });
        }
        if(dvrMaxDuration != null) {
          yield this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/playout_config/dvr_max_duration",
            metadata: parseInt(dvrMaxDuration)
          });
        }
      } else {
        yield this.client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording/playout_config/dvr_start_time"});
        yield this.client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording/playout_config/dvr_max_duration"});
      }
    }

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Update recording config",
        awaitCommitConfirmation: true
      });
    }

    this.rootStore.streamStore.UpdateStream({
      key: slug,
      value: {
        connectionTimeout: connectionTimeout !== undefined ? parseInt(connectionTimeout) : undefined,
        dvrEnabled,
        dvrMaxDuration: dvrMaxDuration != null ? dvrMaxDuration : undefined,
        dvrStartTime: dvrStartTime ? new Date(dvrStartTime).toISOString() : undefined,
        partTtl: retention !== undefined ? parseInt(retention) : undefined,
        reconnectionTimeout: reconnectionTimeout !== undefined ? parseInt(reconnectionTimeout) : undefined
      }
    });

    return {
      writeToken
    };
  });

  UpdateRecordingConfig = flow(function * ({
    libraryId,
    objectId,
    slug,
    writeToken,
    audioFormData,
    configFormData,
    tsFormData,
    multiPathEnabled
  }) {
    if(!libraryId) {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    const {retention, persistent, connectionTimeout, reconnectionTimeout} = configFormData;
    const {copyMpegTs, inputPackaging, copyMode, customReadLoop} = tsFormData;

    yield this.UpdateStreamAudioSettings({
      objectId,
      writeToken,
      slug,
      audioData: audioFormData,
      finalize: false,
      edit: true
    });

    yield this.UpdateConfigMetadata({
      objectId,
      slug,
      retention,
      persistent,
      connectionTimeout,
      reconnectionTimeout,
      copyMpegTs,
      inputPackaging,
      copyMode,
      customReadLoop,
      audioData: audioFormData,
      multiPathEnabled,
      writeToken,
      finalize: false
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Update recording config",
      awaitCommitConfirmation: true
    });
  });

  UpdateGeneralConfig = flow(function * ({
    objectId,
    libraryId,
    formData,
    writeToken,
    slug,
    configProfile,
    updatePermission=false,
    updateAccessGroup=false,
    removeAccessGroup
  }) {
    const {accessGroup, name, url, description, displayTitle, permission} = formData;

    if(!libraryId) {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    yield this.UpdateDetailMetadata({
      objectId,
      name,
      url,
      description,
      displayTitle,
      slug,
      writeToken,
      finalize: false
    });

    if(configProfile) {
      const {siteWriteToken} = yield this.ApplyStreamProfile({
        objectId,
        writeToken,
        profileSlug: configProfile,
        finalize: false
      });

      if(siteWriteToken) {
        yield this.client.FinalizeContentObject({
          libraryId: this.rootStore.dataStore.siteLibraryId,
          objectId: this.rootStore.dataStore.siteId,
          writeToken: siteWriteToken,
          commitMessage: "Update profile streams"
        });
      }
    }

    if(updatePermission) {
      yield this.SetPermission({
        objectId,
        permission
      });
    }

    if(updateAccessGroup) {
      yield this.UpdateAccessGroupPermission({
        objectId,
        addGroup: accessGroup,
        removeGroup: removeAccessGroup
      });
    }

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Apply general config"
    });

    if(configProfile) {
      this.rootStore.streamStore.UpdateStream({
        key: slug,
        value: {
          configProfile
        }
      });
    }
  });

  UpdatePlayoutConfig = flow(function * ({
    objectId,
    slug,
    status,
    watermarkParams,
    drmParams,
    configMetaParams
  }){
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});
    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId
    });

    const basicCallParams = {
      libraryId,
      objectId,
      writeToken,
      slug,
      finalize: false
    };

    yield this.WatermarkConfiguration({
      ...basicCallParams,
      ...watermarkParams,
      status
    });

    yield this.DrmConfiguration({
      ...basicCallParams,
      ...drmParams,
      status
    });

    yield this.UpdateConfigMetadata({
      ...basicCallParams,
      ...configMetaParams,
      skipDvrSection: ![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Apply playout settings"
    });

    const statusResponse = yield this.rootStore.streamStore.CheckStatus({
      objectId
    });

    this.rootStore.streamStore.UpdateStream({
      key: slug,
      value: {
        status: statusResponse.state
      }
    });
  });

  ApplyStreamProfile = flow(function * ({
    objectId,
    writeToken,
    profileSlug,
    finalize=true
  }) {
    const profile = this.rootStore.profileStore.profiles[profileSlug];

    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    const response = yield this.client.StreamApplyProfile({
      profile: toJS(profile),
      objectId,
      streamWriteToken: writeToken,
      finalize: false
    });

    // const existing = yield this.client.ContentObjectMetadata({
    //   objectId,
    //   libraryId,
    //   metadataSubtree: "live_recording"
    // });

    const config = yield this.client.ContentObjectMetadata({
      objectId,
      libraryId,
      writeToken,
      metadataSubtree: "live_recording_config"
    });

    if(profile?.recording_stream_config?.audio) {
      // StreamApplyProfile uses R.mergeDeepRight, which preserves old audio indices not in the new profile.
      // Replace audio entirely so stale channels don't carry over.
      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config/recording_stream_config/audio",
        metadata: toJS(profile.recording_stream_config.audio)
      });

      if(config?.recording_stream_config) {
        config.recording_stream_config.audio = toJS(profile.recording_stream_config.audio);
      }
    } else {
      yield this.client.DeleteMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config/recording_stream_config/audio"
      });

      if(config?.recording_stream_config) {
        delete config.recording_stream_config.audio;
      }
    }

    if(config?.input_stream_info) {
      yield this.client.StreamConfig({
        name: objectId,
        writeToken,
        finalize: false,
        liveRecordingConfig: config
      });
    } else {
      const updated = {
        // ...existing,
        playout_config: {
          // ...existing?.playout_config,
          dvr_enabled: config?.playout_config?.dvr_enabled ?? config?.playout_config?.dvr,
          dvr_max_duration: config?.playout_config?.dvr_max_duration,
          simple_watermark: config?.playout_config?.simple_watermark,
          image_watermark: config?.playout_config?.image_watermark,
          forensic_watermark: config?.playout_config?.forensic_watermark,
        },
        recording_config: {
          // ...existing?.recording_config,
          recording_params: {
            // ...existing?.recording_config?.recording_params,
            reconnect_timeout: config?.recording_config?.reconnect_timeout,
            part_ttl: config?.recording_config?.part_ttl,
            xc_params: {
              // ...existing?.recording_config?.recording_params?.xc_params,
              ...config?.recording_params?.xc_params,
              connection_timeout: config?.recording_config?.connection_timeout,
            }
          }
        }
      };

      yield this.client.ReplaceMetadata({
        objectId,
        libraryId,
        writeToken,
        metadataSubtree: "live_recording",
        metadata: updated
      });
    }

    if(profile?.recording_stream_config?.audio) {
      yield this.UpdateStreamAudioSettings({
        objectId,
        writeToken,
        finalize: false
      });
    }

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Apply stream profile",
        awaitCommitConfirmation: true
      });

      if(response?.siteWriteToken) {
        yield this.client.FinalizeContentObject({
          libraryId: this.rootStore.dataStore.siteLibraryId,
          objectId: this.rootStore.dataStore.siteId,
          writeToken: response.siteWriteToken,
          commitMessage: "Apply stream profile",
          awaitCommitConfirmation: true
        });
      }
    }

    return response;
  });

  // Stream Configuration (probe, watermark, DRM, audio)

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
        metadataSubtree: "live_recording_config"
      });

      const {writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      });

      delete liveRecordingConfig.input_stream_info;
      delete liveRecordingConfig.probe_info;

      yield this.client.StreamConfig({
        name: objectId,
        writeToken,
        finalize: false,
        liveRecordingConfig,
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

      yield this.rootStore.siteStore.UpdateStreamLink({objectId, slug});

      const response = yield this.rootStore.streamStore.CheckStatus({
        objectId
      });

      const streamDetails = yield this.rootStore.streamStore.LoadStreamMetadata({
        objectId
      });

      this.rootStore.streamStore.UpdateStream({
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

    this.rootStore.streamStore.UpdateStream({
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
      this.rootStore.streamStore.UpdateStream({
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

      const statusResponse = yield this.rootStore.streamStore.CheckStatus({
        objectId
      });

      updateValue["status"] = statusResponse.state;
    } else {
      updateValue["watermarkType"] = watermarkType;
    }

    this.rootStore.streamStore.UpdateStream({
      key: slug,
      value: updateValue
    });
  });

  DrmConfiguration = flow(function * ({
    libraryId,
    objectId,
    slug,
    playoutFormats,
    existingPlayoutFormats,
    writeToken,
    status,
    finalize=true
  }) {
    if(existingPlayoutFormats === playoutFormats) { return; }

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
      metadataSubtree: "live_recording/playout_config/playout_formats",
      metadata: playoutFormats
    });

    let updateValue = {}, drmNeedsInit = false;

    if(![STATUS_MAP.UNINITIALIZED, STATUS_MAP.UNCONFIGURED].includes(status)) {
      yield this.client.StreamInitialize({
        name: objectId,
        drm: !!playoutFormats.some(format => !format.includes("clear")),
        format: playoutFormats.join(","),
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

      const statusResponse = yield this.rootStore.streamStore.CheckStatus({
        objectId
      });

      updateValue["status"] = statusResponse.state;
    } else {
      updateValue["drm"] = playoutFormats;
      drmNeedsInit = true;
    }

    this.rootStore.streamStore.UpdateStream({
      key: slug,
      value: updateValue
    });

    return {
      drmNeedsInit,
      drmInitPayload: {
        name: objectId,
        drm: !!playoutFormats.some(format => !format.includes("clear")),
        format: playoutFormats.join(",")
      }
    };
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
        metadataSubtree: "live_recording_config/recording_stream_config/audio"
      });
    }

    const audioIndexMeta = [0, 0, 0, 0, 0, 0, 0, 0];

    const audioStreams = this.CreateAudioStreamsConfig({audioData});
    Object.keys(audioStreams || {}).forEach((stream, i) => {
      let audioLadderSpec = {};
      const audioIndex = Object.keys(audioStreams)[i];
      const audio = audioStreams[audioIndex];

      audioIndexMeta[i] = parseInt(Object.keys(audioStreams || {})[i]);

      if(!audioData[audioIndex].record) { return; }

      for(let j = 0; j < (ladderSpecs.audio || []).length; j++) {
        let element = ladderSpecs.audio[j];
        if(element.channels === audio.recordingChannels) {
          audioLadderSpec = {...element};
          break;
        }
      }

      if(Object.keys(audioLadderSpec).length === 0) {
        audioLadderSpec = {...(ladderSpecs.audio || [])[0]};
      }

      audioLadderSpec.representation = `audioaudio_aac@${audioLadderSpec.bit_rate}`;
      audioLadderSpec.channels = audio.recordingChannels;
      audioLadderSpec.stream_index = parseInt(audioIndex);
      audioLadderSpec.stream_name = `audio_${audioIndex}`;
      audioLadderSpec.stream_label = audioData[audioIndex].playout ? audioData[audioIndex].playout_label : null;
      audioLadderSpec.media_type = 2;
      audioLadderSpec.lang = audioData[audioIndex].lang;

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

  UpdateStreamAudioSettings = flow(function * ({
    objectId,
    writeToken,
    finalize=true,
    audioData,
    edit=false
  }) {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    if(!audioData) {
      audioData = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config/recording_stream_config/audio"
      });
    }

    const audioKeys = Object.keys(audioData || {});
    if(audioKeys.length === 1) {
      audioData = {...audioData, [audioKeys[0]]: {...audioData[audioKeys[0]], default: true}};
    }

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config/recording_stream_config/audio",
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
          "recording_stream_config/audio"
        ]
      });

      const audioConfig = liveRecordingMetadata?.recording_stream_config?.audio || {};
      const probeAudioStreams = (liveRecordingMetadata?.probe_info?.streams || [])
        .filter(stream => stream.codec_type === "audio");
      const audioIndexes = probeAudioStreams.map(stream => stream.stream_index);

      probeAudioStreams.forEach((stream, i) => {
        const currentAudioSetting = audioConfig[stream.stream_index];

        if(currentAudioSetting) {
          currentAudioSetting.bitrate = stream.bit_rate;
          currentAudioSetting.codec = stream.codec_name;
          currentAudioSetting.recording_channels = stream.channels;

          if(probeAudioStreams.length === 1) {
            currentAudioSetting.record = true;
          }
        } else {
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
      // eslint-disable-next-line no-console
      console.error("Unable to sync audio settings to probe data", error);
    }
  });

  // VOD

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
    const timeSeconds = {};
    const firstPeriod = selectedPeriods[0];
    const currentDateTime = new Date();

    if(selectedPeriods.length > 1) {
      const lastPeriod = selectedPeriods[selectedPeriods.length - 1];
      recordingPeriod = null;
      startTime = new Date(firstPeriod?.start_time_epoch_sec * 1000).toISOString();
      endTime = new Date(lastPeriod?.end_time_epoch_sec * 1000).toISOString();

      timeSeconds.startTime = firstPeriod?.start_time_epoch_sec;
      timeSeconds.endTime = lastPeriod?.end_time_epoch_sec;
    } else {
      recordingPeriod = firstPeriod.id;
      timeSeconds.startTime = firstPeriod?.start_time_epoch_sec;
      timeSeconds.endTime = firstPeriod?.end_time_epoch_sec;
    }

    if(!timeSeconds.endTime) {
      timeSeconds.endTime = Math.floor(currentDateTime.getTime() / 1000);
    }

    const titleType = this.rootStore.dataStore.titleContentType;

    if(!targetLibraryId) {
      targetLibraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    const streams = this.rootStore.streamStore.streams;
    const streamSlug = Object.keys(streams || {}).find(slug => (
      streams[slug].objectId === objectId
    ));
    const targetTitle = title || `${streams[streamSlug]?.title || objectId} VoD`;

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
      // eslint-disable-next-line no-console
      console.error("Failed to finalize object", error);
      throw error;
    }

    try {
      yield this.client.SetPermission({
        objectId: targetObjectId,
        permission: "editable"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to set permission", error);
      throw error;
    }

    if(accessGroup) {
      this.AddAccessGroupPermission({
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
      // eslint-disable-next-line no-console
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
}

export default StreamEditStore;
