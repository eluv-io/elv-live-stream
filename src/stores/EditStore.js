// Force strict mode so mutations are only allowed within actions.
import {configure, flow, makeAutoObservable, toJS} from "mobx";
import {ParseLiveConfigData, Slugify} from "Stores/helpers/Helpers";
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

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }

  InitLiveStreamObject = flow(function * ({
    basicFormData,
    inputFormData,
    outputFormData,
    advancedData,
    drmFormData
  }) {
    const {libraryId, url, name, description, displayName, accessGroup, permission} = basicFormData;
    const {avProperties, retention} = advancedData;
    const {encryption} = drmFormData;

    const response = yield this.CreateContentObject({
      libraryId,
      permission
    });

    const {objectId, write_token} = response;

    if(accessGroup) {
      this.AddAccessGroupPermission({
        objectId,
        accessGroup
      });
    }

    const config = ParseLiveConfigData({
      inputFormData,
      outputFormData,
      url,
      encryption,
      avProperties,
      retention
    });

    yield this.AddMetadata({
      libraryId,
      objectId,
      name,
      description,
      displayName,
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

    streamStore.UpdateStream({
      key: Slugify(name),
      value: streamValue
    });

    return objectId;
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
      console.error("Failed to create content object.", error);
    }

    return response;
  });

  AddAccessGroupPermission = flow(function * ({
    objectId,
    accessGroup
  }) {
    try {
      yield this.client.AddContentObjectGroupPermission({
        objectId,
        groupAddress: dataStore.accessGroups[accessGroup]?.address,
        permission: "manage"
      });
    } catch(error) {
      console.error(`Unable to add group permission for group: ${accessGroup}`, error);
    }
  });

  AddMetadata = flow(function * ({
    libraryId,
    objectId,
    writeToken,
    config,
    name,
    description,
    displayName
  }) {
    yield this.client.MergeMetadata({
      libraryId,
      objectId,
      writeToken,
      metadata: {
        public: {
          name,
          description,
          asset_metadata: {
            display_title: displayName || name,
            title: displayName || name,
            title_type: "live_stream",
            video_type: "live"
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
  }

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
      console.error("Failed to replace meta", error);
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
