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

  UpdateDraft(key, jsonString) {
    try {
      this.drafts[key] = JSON.parse(jsonString);
    } catch {
      // keep draft as-is while JSON is invalid mid-edit
    }
  }

  async DeleteProfile(slug) {
    runInAction(() => {
      delete this.drafts[slug];
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
