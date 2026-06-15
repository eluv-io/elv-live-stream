// Manages the live stream platform's core "site" object, including its properties and actions related to platform-level administration.
import {flow, makeObservable, observable} from "mobx";
import type RootStore from "@/stores/RootStore";

class SiteStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeObservable(this, {
      rootStore: observable,
      UpdateStreamLink: flow
    }, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  CreateLink = ({
    targetHash,
    linkTarget="meta/public/asset_metadata",
    options={},
    autoUpdate=true
  }: {targetHash?: string, linkTarget?: string, options?: any, autoUpdate?: boolean}): {".": any, "/": string} => {
    return {
      ...options,
      ".": {
        ...(options["."] || {}),
        ...autoUpdate ? {"auto_update": {"tag": "latest"}} : undefined
      },
      "/": `/qfab/${targetHash}/${linkTarget}`
    };
  };

  *UpdateStreamLink({objectId, slug}: {objectId: string, slug: string}): Generator<any, void> {
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
  }
}

export default SiteStore;
