// Manages the Live Recording Config profiles
import {makeAutoObservable, runInAction, toJS} from "mobx";

class ProfileStore {
  state = "pending";
  profiles = {}; // original, never touched after load
  drafts = {}; // what user is editing

  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }

  async LoadProfiles() {
    try {
      const profiles = await this.client.StreamConfigProfiles({resolveLinks: true});

      runInAction(() => {
        this.profiles = profiles;
        this.drafts = Object.fromEntries(
          Object.entries(profiles).map(([key, value]) => [key, {...value}])
        );
        this.state = "loaded";
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load profiles.", error);
      runInAction(() => {
        this.state = "error";
      });
    }
  }

  AddDraft() {
    const draftName = `Draft Profile ${Object.keys(this.drafts).length + 1}`;
    runInAction(() => {
      this.drafts[draftName] = {
        name: draftName
      };
    });
  }

  UpdateDraft(key, jsonString) {
    try {
      this.drafts[key] = JSON.parse(jsonString);
    } catch {
      // keep draft as-is while JSON is invalid mid-edit
    }
  }

  async DeleteProfile(slug) {
    const profileName = this.profiles[slug]?.name || slug;
    const libraryId = this.rootStore.dataStore.siteLibraryId;
    const objectId = this.rootStore.dataStore.siteId;

    const {writeToken} = await this.client.EditContentObject({
      libraryId,
      objectId
    });

    await this.client.DeleteFiles({
      libraryId,
      objectId,
      writeToken,
      filePaths: [`live_stream_profiles/${profileName}.json`]
    });

    await this.client.DeleteMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: `public/asset_metadata/profiles/${slug}`
    });

    await this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Delete config profile"
    });

    runInAction(() => {
      delete this.drafts[slug];
      delete this.profiles[slug];
    });
  }

  ResetProfile(slug) {
    this.drafts[slug] = this.profiles[slug];
  }

  async SaveProfiles() {
    if(!this.rootStore.dataStore.siteId) { throw new Error("Tenant is not configured with a site ID"); }

    const {writeToken} = await this.client.EditContentObject({
      libraryId: this.rootStore.dataStore.siteLibraryId,
      objectId: this.rootStore.dataStore.siteId
    });

    let needsFinalize = false;

    for(let draftKey in this.drafts) {
      const draft = this.drafts[draftKey];
      const profile = this.profiles[draftKey];

      const isDirty = JSON.stringify(draft) !== JSON.stringify(profile);

      if(isDirty) {
          // Profile is uploaded with the same filename/path, overwriting existing file
        needsFinalize = true;
        await this.client.StreamSaveConfigProfile({
          profileMetadata: toJS(draft),
          writeToken,
          finalize: false
        });

        if(draft.name !== profile.name) {
          // Old profile must be deleted after new profile is created if the name has changed
        }
      }
    }

    if(needsFinalize) {
      await this.client.FinalizeContentObject({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId,
        writeToken,
        commitMessage: "Update config profiles"
      });
    }
  }
}

export default ProfileStore;
