import {configure, flow, makeAutoObservable} from "mobx";
import {ParseLiveConfigData, Slugify} from "@/utils/helpers.js";
import {STATUS_MAP} from "@/utils/constants.js";

configure({
  enforceActions: "always"
});

// Handles the business logic for stream creators, covering creation, editing, and live stream control.
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

  InitLiveStreamObject = flow(function * ({
    accessGroup,
    description,
    displayTitle,
    encryption,
    libraryId,
    name,
    permission,
    playoutProfile,
    protocol,
    retention,
    persistent,
    url
  }) {
    const response = yield this.CreateContentObject({
      libraryId,
      permission
    });

    const {objectId, writeToken} = response;

    if(accessGroup) {
      this.AddAccessGroupPermission({
        objectId,
        groupName: accessGroup
      });
    }

    const config = ParseLiveConfigData({
      url,
      encryption,
      playoutProfile,
      retention,
      persistent,
      referenceUrl: protocol === "custom" ? undefined : url
    });

    yield this.AddMetadata({
      libraryId,
      objectId,
      name,
      description,
      displayTitle,
      writeToken,
      config,
      finalize: false
    });

    yield this.rootStore.siteStore.CreateSiteLinks({objectId});

    try {
      yield this.client.SetPermission({
        objectId,
        permission,
        writeToken
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to set permission.", error);
    }

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Create stream object",
      awaitCommitConfirmation: true
    });

    yield this.rootStore.siteStore.AddStreamToSite({objectId});

    const statusResponse = yield this.rootStore.streamBrowseStore.CheckStatus({
      objectId
    });

    const streamValue = {
      objectId,
      title: name,
      status: statusResponse.state,
    };

    const streamDetails = yield this.rootStore.dataStore.LoadStreamMetadata({
      objectId,
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
      objectId,
      slug: Slugify(name)
    };
  });


  // Update audio settings for streams that have been created and probed
  UpdateLiveStreamObject = flow(function * ({
    audioFormData,
    objectId,
    slug,
    accessGroup,
    description,
    displayTitle,
    encryption,
    libraryId,
    name,
    playoutProfile,
    protocol,
    retention,
    persistent,
    url
  }) {
    if(accessGroup) {
      this.AddAccessGroupPermission({
        objectId,
        groupName: accessGroup
      });
    }

    // Remove audio stream from meta if record=false
    Object.keys(audioFormData || {}).forEach(index => {
      if(!audioFormData[index].record) {
        delete audioFormData[index];
      }
    });

    const config = ParseLiveConfigData({
      url,
      encryption,
      playoutProfile,
      retention,
      persistent,
      referenceUrl: protocol === "custom" ? undefined : url,
      audioFormData
    });

    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId
    });

    yield this.AddMetadata({
      libraryId,
      objectId,
      name,
      description,
      displayTitle,
      config,
      writeToken,
      finalize: false
    });

    yield this.rootStore.streamBrowseStore.UpdateStreamAudioSettings({
      objectId,
      slug,
      writeToken,
      audioData: audioFormData,
      finalize: false
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Update audio settings",
      awaitCommitConfirmation: true
    });
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


  UpdateRetention = flow(function * ({
    objectId,
    libraryId,
    slug,
    retention,
    writeToken
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

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config/part_ttl",
      metadata: parseInt(retention)
    });

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording/recording_config/recording_params/part_ttl",
      metadata: parseInt(retention)
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Update retention",
      awaitCommitConfirmation: true
    });

    this.rootStore.streamBrowseStore.UpdateStream({
      key: slug,
      value: {
        partTtl: retention
      }
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
    playoutProfile,
    copyMpegTs
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

    const updateValue = {};

    if(retention !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config/part_ttl",
        metadata: parseInt(retention)
      });

      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/part_ttl",
        metadata: parseInt(retention)
      });

      updateValue.partTtl = parseInt(retention);
    }

    if(persistent !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/persistent",
        metadata: persistent
      });
    }

    if(playoutProfile !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config/playout_ladder_profile",
        metadata: playoutProfile
      });
      updateValue.playoutLadderProfile = playoutProfile;
    }

    if(connectionTimeout !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/xc_params/connection_timeout",
        metadata: parseInt(connectionTimeout)
      });

      updateValue.connectionTimeout = parseInt(connectionTimeout);
    }

    if(reconnectionTimeout !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/reconnect_timeout",
        metadata: parseInt(reconnectionTimeout)
      });

      updateValue.reconnectionTimeout = parseInt(reconnectionTimeout);
    }

    if(copyMpegTs !== undefined) {
      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording/recording_config/recording_params/xc_params/copy_mpegts",
        metadata: copyMpegTs
      });
    }

    if(!skipDvrSection) {
      if(dvrEnabled !== undefined) {
        const playoutMeta = yield this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording/playout_config"
        });

        if(dvrEnabled === true) {
          playoutMeta.dvr_enabled = dvrEnabled;
          if(![undefined, null].includes(dvrStartTime)) {
            playoutMeta.dvr_start_time = new Date(dvrStartTime).toISOString();
          } else {
            delete playoutMeta.dvr_start_time;
          }

          if(![undefined, null].includes(dvrMaxDuration)) {
            playoutMeta.dvr_max_duration = parseInt(dvrMaxDuration);
          } else {
            delete playoutMeta.dvr_max_duration;
          }
        } else if(dvrEnabled === false) {
          playoutMeta.dvr_enabled = dvrEnabled;
          delete playoutMeta.dvr_max_duration;
          delete playoutMeta.dvr_start_time;
        }

        yield this.client.ReplaceMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording/playout_config",
          metadata: playoutMeta
        });

        updateValue.dvrEnabled = dvrEnabled;
        updateValue.dvrMaxDuration = [undefined, null].includes(dvrMaxDuration) ? undefined : (dvrMaxDuration);
        updateValue.dvrStartTime = dvrStartTime ? new Date(dvrStartTime).toISOString() : undefined;
      }
    }

    if(finalize && Object.keys(updateValue || {}).length > 0) {
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
      value: updateValue
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

    const {copyMpegTs} = tsFormData;

    yield this.rootStore.streamBrowseStore.UpdateStreamAudioSettings({
      objectId,
      writeToken,
      slug,
      audioData: audioFormData,
      finalize: false
    });

    yield this.UpdateConfigMetadata({
      objectId,
      slug,
      retention,
      persistent,
      connectionTimeout,
      reconnectionTimeout,
      copyMpegTs,
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
  });

  UpdatePlayoutConfig = flow(function * ({
    objectId,
    slug,
    status,
    watermarkParams,
    drmParams,
    configMetaParams,
    playoutProfileParams
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

    // Apply playout profile settings

    yield this.rootStore.streamBrowseStore.UpdateLadderSpecs({
      ...basicCallParams,
      ...playoutProfileParams
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Apply playout settings"
    });

    // Initialize stream after DRM update

    // if(drmResponse?.drmNeedsInit) {
    //   yield this.client.StreamInitialize({
    //     finalize: false,
    //     ...drmResponse?.drmInitPayload
    //   });
    // }

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


  SaveLadderProfiles = flow(function * ({profileData}) {
    try {
      if(!this.rootStore.dataStore.siteId) { throw new Error("Tenant is not configured with a site ID"); }
      const libraryId = yield this.client.ContentObjectLibraryId({objectId: this.rootStore.dataStore.siteId});
      const {writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId: this.rootStore.dataStore.siteId
      });

      profileData.default = JSON.parse(profileData.default || {});
      profileData.custom = profileData.custom.map(item => JSON.parse(item || {}));

      yield this.client.ReplaceMetadata({
        libraryId,
        objectId: this.rootStore.dataStore.siteId,
        writeToken,
        metadataSubtree: "public/asset_metadata/profiles",
        metadata: profileData
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId: this.rootStore.dataStore.siteId,
        writeToken,
        commitMessage: "Update playout ladder profiles",
        awaitCommitConfirmation: true
      });

      this.rootStore.dataStore.UpdateLadderProfiles({profiles: profileData});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save ladder profiles", error);

      throw error;
    }
  });

  DeleteStream = flow(function * ({objectId}) {
    const streams = Object.assign({}, this.rootStore.streamBrowseStore.streams);
    const slug = Object.keys(streams).find(streamSlug => {
      return streams[streamSlug].objectId === objectId;
    });

    const streamMetadata = yield this.client.ContentObjectMetadata({
      libraryId: this.rootStore.dataStore.siteLibraryId,
      objectId: this.rootStore.dataStore.siteId,
      metadataSubtree: "public/asset_metadata/live_streams",
    });

    delete streamMetadata[slug];

    const {writeToken} = yield this.client.EditContentObject({
      libraryId: this.rootStore.dataStore.siteLibraryId,
      objectId: this.rootStore.dataStore.siteId
    });

    yield this.client.ReplaceMetadata({
      libraryId: this.rootStore.dataStore.siteLibraryId,
      objectId: this.rootStore.dataStore.siteId,
      writeToken,
      metadataSubtree: "public/asset_metadata/live_streams",
      metadata: streamMetadata
    });

    yield this.client.FinalizeContentObject({
      libraryId: this.rootStore.dataStore.siteLibraryId,
      objectId: this.rootStore.dataStore.siteId,
      writeToken,
      commitMessage: "Delete live stream"
    });

    yield this.client.DeleteContentObject({
      libraryId: yield this.client.ContentObjectLibraryId({objectId}),
      objectId
    });

    delete streams[slug];
    this.rootStore.streamBrowseStore.UpdateStreams({streams});
  });
}

export default StreamManagementStore;
