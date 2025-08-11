import {flow, toJS} from "mobx";
import {Slugify} from "@/utils/helpers.js";

// Manages the live stream platform's core "site" object, including its properties and actions related to platform-level administration.
class SiteStore {
  constructor(rootStore) {
    this.rootStore = rootStore;
  }

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
  });

  AddStreamToSite = flow(function * ({objectId}) {
    try {
      const streamMetadata = yield this.client.ContentObjectMetadata({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId,
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
              container: yield this.client.LatestVersionHash({objectId: this.rootStore.dataStore.siteId})
            }
          }
        }),
        order: Object.keys(streamMetadata).length,
      };

      const {writeToken} = yield this.client.EditContentObject({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId
      });

      yield this.client.ReplaceMetadata({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId,
        writeToken,
        metadataSubtree: "public/asset_metadata/live_streams",
        metadata: {
          ...toJS(streamMetadata),
          [Slugify(objectName)]: streamData
        }
      });

      yield this.client.FinalizeContentObject({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId,
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
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId,
        metadataSubtree: `public/asset_metadata/live_streams/${slug}`,
      });

      const link = this.CreateLink({
        targetHash: yield this.client.LatestVersionHash({objectId}),
        options: originalLink
      });

      const {writeToken} = yield this.client.EditContentObject({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId
      });

      yield this.client.ReplaceMetadata({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId,
        writeToken,
        metadataSubtree: `public/asset_metadata/live_streams/${slug}`,
        metadata: link
      });

      yield this.client.FinalizeContentObject({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId,
        writeToken,
        commitMessage: "Update stream link",
        awaitCommitConfirmation: true
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update stream link", error);
    }
  });
}

export default SiteStore;
