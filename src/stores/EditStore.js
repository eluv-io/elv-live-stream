// Force strict mode so mutations are only allowed within actions.
import {configure, flow, makeAutoObservable, runInAction, toJS} from "mobx";
import {ParseLiveConfigData, Slugify} from "@/utils/helpers";
import {dataStore, streamStore} from "./index";

configure({
  enforceActions: "always"
});

// Store for handling writing content
class EditStore {
  rootStore;
  libraries;
  accessGroups;
  contentType;

  constructor(rootStore) {
    makeAutoObservable(this);

    runInAction(() => {
      this.rootStore = rootStore;
    });
  }

  get client() {
    return this.rootStore.client;
  }

  InitLiveStreamObject = flow(function * ({
    basicFormData,
    advancedData,
    drmFormData,
    playoutProfile
  }) {
    const {libraryId, url, name, description, displayTitle, accessGroup, permission, protocol} = basicFormData;
    const {retention} = advancedData;
    const {encryption} = drmFormData;

    const response = yield this.CreateContentObject({
      libraryId,
      permission
    });

    const {objectId, write_token} = response;

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
      referenceUrl: protocol === "custom" ? undefined : url
    });

    yield this.AddMetadata({
      libraryId,
      objectId,
      name,
      description,
      displayTitle,
      writeToken: write_token,
      config
    });

    yield this.CreateSiteLinks({objectId});
    yield this.AddStreamToSite({objectId});

    try {
      yield this.client.SetPermission({
        objectId,
        permission
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to set permission.", error);
    }

    const statusResponse = yield streamStore.CheckStatus({
      objectId
    });

    const streamValue = {
      objectId,
      title: name,
      status: statusResponse.state,
    };

    const streamDetails = yield dataStore.LoadStreamMetadata({
      objectId,
      libraryId
    }) || {};

    Object.keys(streamDetails).forEach(detail => {
      streamValue[detail] = streamDetails[detail];
    });

    streamStore.UpdateStream({
      key: Slugify(name),
      value: streamValue
    });

    return {
      objectId,
      slug: Slugify(name)
    };
  });

  UpdateLiveStreamObject = flow(function * ({
    basicFormData,
    advancedData,
    drmFormData,
    audioFormData,
    objectId,
    slug
  }) {
    const {libraryId, url, name, description, displayTitle, accessGroup, protocol} = basicFormData;
    const {retention} = advancedData;
    const {encryption} = drmFormData;

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
      retention,
      referenceUrl: protocol === "custom" ? undefined : url,
      audioFormData
    });

    yield this.AddMetadata({
      libraryId,
      objectId,
      name,
      description,
      displayTitle,
      config
    });

    yield streamStore.ConfigureStream({
      objectId,
      slug
    });
  });

  CreateContentObject = flow(function * ({
    libraryId
  }) {
    let response;
    try {
      response = yield this.client.CreateContentObject({
        libraryId,
        options: { type: dataStore.contentType }
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
        groupAddress = dataStore.accessGroups[groupName]?.address;
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

  SetPermission = ({objectId, permission}) => {
    try {
      return this.client.SetPermission({
        objectId,
        permission
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to set permission.", error);
    }
  };

  AddMetadata = flow(function * ({
    libraryId,
    objectId,
    writeToken,
    config,
    name,
    description,
    displayTitle
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

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Add metadata",
      awaitCommitConfirmation: true
    });
  });

  UpdateDetailMetadata = flow(function * ({
    libraryId,
    objectId,
    writeToken,
    name,
    description,
    displayTitle
  }) {
    try {
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

      return this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Update metadata",
        awaitCommitConfirmation: true
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update metadata", error);
    }
  });

  CreateSiteLinks = flow(function * ({objectId}) {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});
    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId
    });

    yield this.client.CreateLinks({
      libraryId,
      objectId,
      writeToken,
      links: [{
        type: "rep",
        path: "public/asset_metadata/sources/default",
        target: "playout/default/options.json"
      }]
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Create stream link",
      awaitCommitConfirmation: true
    });
  });

  CreateLink = ({
    targetHash,
    linkTarget="meta/public/asset_metadata",
    options={},
    autoUpdate=true
  }) => {
    return {
      ...options,
      ".": {
        ...(options["."] || {}),
        ...autoUpdate ? {"auto_update": {"tag": "latest"}} : undefined
      },
      "/": `/qfab/${targetHash}/${linkTarget}`
    };
  };

  AddStreamToSite = flow(function * ({objectId}) {
    try {
      const streamMetadata = yield this.client.ContentObjectMetadata({
        libraryId: dataStore.siteLibraryId,
        objectId: dataStore.siteId,
        metadataSubtree: "public/asset_metadata/live_streams",
      });

      const objectName = yield this.client.ContentObjectMetadata({
        libraryId: yield this.client.ContentObjectLibraryId({objectId}),
        objectId,
        metadataSubtree: "public/name"
      });

      const streamData = {
        ...this.CreateLink({
          targetHash: yield this.client.LatestVersionHash({objectId}),
          options: {
            ".": {
              container: yield this.client.LatestVersionHash({objectId: dataStore.siteId})
            }
          }
        }),
        order: Object.keys(streamMetadata).length,
      };

      const {writeToken} = yield this.client.EditContentObject({
        libraryId: dataStore.siteLibraryId,
        objectId: dataStore.siteId
      });

      yield this.client.ReplaceMetadata({
        libraryId: dataStore.siteLibraryId,
        objectId: dataStore.siteId,
        writeToken,
        metadataSubtree: "public/asset_metadata/live_streams",
        metadata: {
          ...toJS(streamMetadata),
          [Slugify(objectName)]: streamData
        }
      });

      yield this.client.FinalizeContentObject({
        libraryId: dataStore.siteLibraryId,
        objectId: dataStore.siteId,
        writeToken,
        commitMessage: "Add live stream",
        awaitCommitConfirmation: true
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to replace meta", error);
    }
  });

  UpdateStreamLink = flow(function * ({objectId, slug}) {
    try {
      const originalLink = yield this.client.ContentObjectMetadata({
        libraryId: dataStore.siteLibraryId,
        objectId: dataStore.siteId,
        metadataSubtree: `public/asset_metadata/live_streams/${slug}`,
      });

      const link = this.CreateLink({
        targetHash: yield this.client.LatestVersionHash({objectId}),
        options: originalLink
      });

      const {writeToken} = yield this.client.EditContentObject({
        libraryId: dataStore.siteLibraryId,
        objectId: dataStore.siteId
      });

      yield this.client.ReplaceMetadata({
        libraryId: dataStore.siteLibraryId,
        objectId: dataStore.siteId,
        writeToken,
        metadataSubtree: `public/asset_metadata/live_streams/${slug}`,
        metadata: link
      });

      yield this.client.FinalizeContentObject({
        libraryId: dataStore.siteLibraryId,
        objectId: dataStore.siteId,
        writeToken,
        commitMessage: "Update stream link",
        awaitCommitConfirmation: true
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update stream link", error);
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

    streamStore.UpdateStream({
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
    slug,
    retention,
    connectionTimeout,
    reconnectionTimeout,
    skipDvrSection=false,
    dvrEnabled,
    dvrStartTime,
    dvrMaxDuration,
    playoutProfile
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

    if(!skipDvrSection) {
      if(dvrEnabled !== undefined) {
        const playoutMeta = yield this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording/playout_config"
        });

        if(dvrEnabled === true) {
          playoutMeta.dvr_enabled = dvrEnabled;
          if(![undefined, null].includes(dvrStartTime)) {
            playoutMeta.dvr_start_time = dvrStartTime.toISOString();
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
        updateValue.dvrMaxDuration = [undefined, null].includes(dvrMaxDuration) ? undefined : parseInt(dvrMaxDuration);
        updateValue.dvrStartTime = dvrStartTime ? dvrStartTime.toISOString() : undefined;
      }
    }

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Update recording config",
      awaitCommitConfirmation: true
    });

    streamStore.UpdateStream({
      key: slug,
      value: updateValue
    });
  });


  SaveLadderProfiles = flow(function * ({profileData}) {
    try {
      const libraryId = yield this.client.ContentObjectLibraryId({objectId: dataStore.siteId});
      const {writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId: dataStore.siteId
      });

      profileData.default = JSON.parse(profileData.default || {});
      profileData.custom = profileData.custom.map(item => JSON.parse(item || {}));

      yield this.client.ReplaceMetadata({
        libraryId,
        objectId: dataStore.siteId,
        writeToken,
        metadataSubtree: "public/asset_metadata/profiles",
        metadata: profileData
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId: dataStore.siteId,
        writeToken,
        commitMessage: "Update playout ladder profiles",
        awaitCommitConfirmation: true
      });

      dataStore.UpdateLadderProfiles({profiles: profileData});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save ladder profiles", error);
    }
  });


  DeleteStream = flow(function * ({objectId}) {
    const streams = Object.assign({}, streamStore.streams);
    const slug = Object.keys(streams).find(streamSlug => {
      return streams[streamSlug].objectId === objectId;
    });

    const streamMetadata = yield this.client.ContentObjectMetadata({
      libraryId: dataStore.siteLibraryId,
      objectId: dataStore.siteId,
      metadataSubtree: "public/asset_metadata/live_streams",
    });

    delete streamMetadata[slug];

    const {writeToken} = yield this.client.EditContentObject({
      libraryId: dataStore.siteLibraryId,
      objectId: dataStore.siteId
    });

    yield this.client.ReplaceMetadata({
      libraryId: dataStore.siteLibraryId,
      objectId: dataStore.siteId,
      writeToken,
      metadataSubtree: "public/asset_metadata/live_streams",
      metadata: streamMetadata
    });

    yield this.client.FinalizeContentObject({
      libraryId: dataStore.siteLibraryId,
      objectId: dataStore.siteId,
      writeToken,
      commitMessage: "Delete live stream"
    });

    delete streams[slug];
    streamStore.UpdateStreams({streams});
  });
}

export default EditStore;
