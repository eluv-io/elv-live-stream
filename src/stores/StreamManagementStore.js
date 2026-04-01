// Handles stream creation, configuration writes, and profile application — anything that modifies stream metadata or objects.
import {flow, makeAutoObservable, toJS} from "mobx";
import {ParseLiveConfigData, Slugify} from "@/utils/helpers.js";
import {STATUS_MAP} from "@/utils/constants.js";

class StreamManagementStore {
  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }

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

  /**
   * Creates a new live stream content object and registers it in the stream browse store.
   *
   * Builds a live recording config from the provided parameters (merging over the config
   * profile as a baseline if one is specified), calls StreamCreate, checks the initial
   * stream status, and loads stream metadata so the new stream is immediately available
   * in the UI.
   *
   * @param {string} accessGroup - Name of the access group to grant permissions to
   * @param {string} description - Stream description
   * @param {string} displayTitle - Display title for the stream
   * @param {string} encryption - DRM/encryption setting (e.g. "clear", "drm")
   * @param {string} libraryId - Library in which to create the stream object
   * @param {string} name - Stream name (also used to derive the slug)
   * @param {string} permission - Object permission level
   * @param {string} profileSlug - Slug key of the config profile to use as baseline (optional)
   * @param {number|null} retention - Part TTL in seconds, or null if persistent
   * @param {boolean} persistent - Whether the stream is persistent (no TTL)
   * @param {string} url - Ingest URL for the stream
   *
   * @returns {{ objectId: string, slug: string }} The created object's ID and slug
   */
  InitLiveStreamObject = flow(function * ({
    objectId,
    audioFormData,
    accessGroup,
    description,
    displayTitle,
    encryption,
    libraryId,
    name,
    permission,
    configProfile,
    retention,
    persistent,
    url
  }) {
    try {
      // Remove audio stream from meta if record=false
      Object.keys(audioFormData || {}).forEach(index => {
        if(!audioFormData[index].record) {
          delete audioFormData[index];
        }
      });

      const config = ParseLiveConfigData({
        encryption,
        configProfile,
        retention,
        persistent,
        audioFormData
      });

      const groupAddress = this.rootStore.dataStore.accessGroups[accessGroup]?.address;

      const response = yield this.client.StreamCreate({
        libraryId,
        objectId,
        url,
        liveRecordingConfig: config,
        options: {
          name,
          displayTitle,
          description,
          accessGroups: groupAddress ? [groupAddress] : undefined,
          permission,
          linkToSite: true,
          // TODO: Add ingress node api for non-public nodes
          // ingressNodeApi
        }
      });

      const createdObjectId = response.objectId;

      const statusResponse = yield this.rootStore.streamBrowseStore.CheckStatus({
        objectId: createdObjectId
      });

      const streamValue = {
        objectId: createdObjectId,
        title: name,
        status: statusResponse.state,
      };

      const streamDetails = yield this.rootStore.dataStore.LoadStreamMetadata({
        objectId: createdObjectId,
        libraryId
      }) || {};

      Object.keys(streamDetails).forEach(detail => {
        streamValue[detail] = streamDetails[detail];
      });

      this.rootStore.streamBrowseStore.UpdateStream({
        key: Slugify(name),
        value: streamValue
      });

      return {
        objectId: createdObjectId,
        slug: Slugify(name)
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create stream.", error);
      throw error;
    }
  });

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
            slug: Slugify(name)
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

      this.rootStore.streamBrowseStore.UpdateStream({
        key: slug,
        value: updateValue
      });

      return response;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update metadata", error);
    }
  });

  ApplyStreamProfile = flow(function * ({objectId, writeToken, profileSlug}) {
    const profile = this.rootStore.profileStore.profiles[profileSlug];

    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    yield this.client.StreamApplyProfile({
      profile: toJS(profile),
      objectId,
      streamWriteToken: writeToken,
      finalize: true
    });
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
    audioData
    // configProfile
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

    const existing = yield this.client.ContentObjectMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config"
    });

    const recordingConfig = {...existing?.recording_config};
    if(retention !== undefined)           recordingConfig.part_ttl = parseInt(retention);
    if(persistent !== undefined)          recordingConfig.persistent = persistent;
    if(connectionTimeout !== undefined)   recordingConfig.connection_timeout = parseInt(connectionTimeout);
    if(reconnectionTimeout !== undefined) recordingConfig.reconnect_timeout = parseInt(reconnectionTimeout);
    if(copyMpegTs !== undefined) {
      recordingConfig.input_cfg = copyMpegTs ? {
        bypass_libav_reader: true,
        copy_mode: copyMode,
        copy_packaging: inputPackaging,
        custom_read_loop_enabled: customReadLoop,
        input_packaging: inputPackaging
      } : {};
    }

    const recordingStreamConfig = {...existing?.recording_stream_config};
    if(audioData !== undefined) {
      recordingStreamConfig.audio = audioData;
    }

    const playoutConfig = {...existing?.playout_config};
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

    const newMetadata = {...existing, recording_config: recordingConfig, playout_config: playoutConfig, recording_stream_config: recordingStreamConfig};

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config",
      metadata: {...existing, recording_config: recordingConfig, playout_config: playoutConfig, recording_stream_config: recordingStreamConfig}
    });

    yield this.client.StreamConfig({
      name: objectId,
      writeToken,
      liveRecordingConfig: newMetadata,
      finalize: false
    });

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Update recording config",
        awaitCommitConfirmation: true
      });
    }

    this.rootStore.streamBrowseStore.UpdateStream({
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
    tsFormData
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

    // yield this.rootStore.streamBrowseStore.UpdateStreamAudioSettings({
    //   objectId,
    //   writeToken,
    //   slug,
    //   audioData: audioFormData,
    //   finalize: false,
    //   edit
    // });

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
      // Update site object with stream/profile
      const {siteWriteToken} = yield this.client.StreamApplyProfile({
        profile: toJS(this.rootStore.profileStore.profiles[configProfile]),
        objectId,
        streamWriteToken: writeToken,
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
      this.rootStore.streamBrowseStore.UpdateStream({
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

    // Apply watermark settings

    yield this.rootStore.streamBrowseStore.WatermarkConfiguration({
      ...basicCallParams,
      ...watermarkParams,
      status
    });

    // Apply DRM settings

    yield this.rootStore.streamBrowseStore.DrmConfiguration({
      ...basicCallParams,
      ...drmParams,
      status
    });

    // Apply config metadata changes

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

    // Update status
    const statusResponse = yield this.rootStore.streamBrowseStore.CheckStatus({
      objectId
    });

    this.rootStore.streamBrowseStore.UpdateStream({
      key: slug,
      value: {
        status: statusResponse.state
      }
    });
  });

  DeleteStream = flow(function * ({objectId, slug}) {
    const streams = Object.assign({}, this.rootStore.streamBrowseStore.streams);

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
    this.rootStore.streamBrowseStore.UpdateStreams({streams});
  });
}

export default StreamManagementStore;
