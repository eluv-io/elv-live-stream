// Manages live recording config profiles — loading, creating, and applying reusable stream configuration templates.
import {makeAutoObservable, runInAction, toJS} from "mobx";
import {slugify} from "@eluvio/elv-client-js/utilities/lib/helpers.js";
import {defaultConfigProfile} from "@/utils/defaultProfile.js";

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

  get sortedDrafts() {
    return Object.fromEntries(
      Object.entries(this.drafts).sort(([a], [b]) => a.localeCompare(b))
    );
  }

  get sortedProfiles() {
    return Object.fromEntries(
      Object.entries(this.profiles).sort(([a], [b]) => a.localeCompare(b))
    );
  }

  async LoadProfiles() {
    try {
      const profiles = await this.client.StreamConfigProfiles({resolveLinks: true}) ?? {};

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
    const draftName = `Config Profile ${Object.keys(this.drafts).length + 1}`;
    const draftKey = slugify(draftName);
    runInAction(() => {
      this.drafts[draftKey] = {
        ...defaultConfigProfile,
        name: draftName
      };
    });
    return draftKey;
  }

  UpdateDraft(key, jsonString) {
    try {
      this.drafts[key] = JSON.parse(jsonString);
    } catch {
      // keep draft as-is while JSON is invalid mid-edit
    }
  }

  async DeleteProfile(slug) {
    const libraryId = this.rootStore.dataStore.siteLibraryId;
    const objectId = this.rootStore.dataStore.siteId;

    // Deleting an existing profile
    // For a profile that hasn't been saved, only the draft needs removal
    if(slug in this.profiles) {
      const {writeToken} = await this.client.EditContentObject({
        libraryId,
        objectId
      });

      await this.client.DeleteFiles({
        libraryId,
        objectId,
        writeToken,
        filePaths: [`live_stream_profiles/${slug}.json`]
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
    }

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
        try {
          await this.client.StreamSaveConfigProfile({
            profileMetadata: toJS(draft),
            writeToken,
            finalize: false
          });

          if(profile && draft.name !== profile.name) {
            const newKey = slugify(draft.name);
            const libraryId = this.rootStore.dataStore.siteLibraryId;
            const objectId = this.rootStore.dataStore.siteId;

            await this.client.DeleteFiles({
              libraryId,
              objectId,
              writeToken,
              filePaths: [`live_stream_profiles/${slugify(profile.name)}.json`]
            });

            await this.client.DeleteMetadata({
              libraryId,
              objectId,
              writeToken,
              metadataSubtree: `public/asset_metadata/profiles/${draftKey}`
            });

            const streamIds = await this.client.ContentObjectMetadata({
              libraryId,
              objectId,
              metadataSubtree: `public/asset_metadata/profile_streams/${draftKey}`
            }) || [];

            if(streamIds.length > 0) {
              await this.client.ReplaceMetadata({
                libraryId,
                objectId,
                writeToken,
                metadataSubtree: `public/asset_metadata/profile_streams/${newKey}`,
                metadata: streamIds
              });
            }

            await this.client.DeleteMetadata({
              libraryId,
              objectId,
              writeToken,
              metadataSubtree: `public/asset_metadata/profile_streams/${draftKey}`
            });
          }

          runInAction(() => {
            if(profile && draft.name !== profile.name) {
              const newKey = slugify(draft.name);
              delete this.profiles[draftKey];
              delete this.drafts[draftKey];
              this.profiles[newKey] = {...toJS(draft)};
              this.drafts[newKey] = {...toJS(draft)};
            } else {
              this.profiles[draftKey] = {...toJS(draft)};
            }
          });
        } catch(error) {
          // eslint-disable-next-line no-console
          console.error("Failed to create content object.", error);
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
