// Manages live recording config profiles — loading, creating, and applying reusable stream configuration templates.
import {makeAutoObservable, runInAction, toJS} from "mobx";
import {slugify} from "@eluvio/elv-client-js/utilities/lib/helpers.js";
import {defaultConfigProfile} from "@/utils/defaultProfile.js";
import RootStore from "@/stores/RootStore";
import {LiveRecordingConfigProfile} from "@/utils/stream";

class ProfileStore {
  state: "pending" | "loaded" | "error" = "pending";
  profiles: Record<string, LiveRecordingConfigProfile> = {}; // original, never touched after load
  drafts: Record<string, LiveRecordingConfigProfile> = {}; // what user is editing
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this);
  }

  get client() {
    return this.rootStore.client;
  }

  get sortedDrafts(): Record<string, LiveRecordingConfigProfile> {
    return Object.fromEntries(
      Object.entries(this.drafts).sort(([a], [b]) => a.localeCompare(b))
    );
  }

  get sortedProfiles(): Record<string, LiveRecordingConfigProfile> {
    return Object.fromEntries(
      Object.entries(this.profiles).sort(([a], [b]) => a.localeCompare(b))
    );
  }

  *LoadProfiles(): Generator<any, void> {
    try {
      const profiles: Record<string, LiveRecordingConfigProfile> = (yield this.client.StreamConfigProfiles({resolveLinks: true})) ?? {};

      this.profiles = profiles;
      this.drafts = Object.fromEntries(
        Object.entries(profiles).map(([key, value]) => [key, {...value}])
      );
      this.state = "loaded";
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load profiles.", error);
      this.state = "error";
    }
  }

  AddDraft(): string {
    const draftName = `Config Profile ${Object.keys(this.drafts).length + 1}`;
    const draftKey = slugify(draftName);
    runInAction(() => {
      this.drafts[draftKey] = {
        ...(defaultConfigProfile as LiveRecordingConfigProfile),
        name: draftName
      };
    });
    return draftKey;
  }

  UpdateDraft(key: string, jsonString: string) {
    try {
      this.drafts[key] = JSON.parse(jsonString);
    } catch {
      // keep draft as-is while JSON is invalid mid-edit
    }
  }

  *DeleteProfile(slug: string): Generator<any, void> {
    try {
      const libraryId = this.rootStore.dataStore.siteLibraryId;
      const objectId = this.rootStore.dataStore.siteId;

      // For a profile that hasn't been saved, only the draft needs removal
      if(slug in this.profiles) {
        const {writeToken} = yield this.client.EditContentObject({
          libraryId,
          objectId
        });

        yield this.client.DeleteFiles({
          libraryId,
          objectId,
          writeToken,
          filePaths: [`live_stream_profiles/${slug}.json`]
        });

        yield this.client.DeleteMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: `public/asset_metadata/profiles/${slug}`
        });

        yield this.client.FinalizeContentObject({
          libraryId,
          objectId,
          writeToken,
          commitMessage: "Delete config profile"
        });
      }

      delete this.drafts[slug];
      delete this.profiles[slug];
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete profile.", error);
      throw error;
    }
  }

  *SaveProfiles(): Generator<any, void> {
    if(!this.rootStore.dataStore.siteId) { throw new Error("Tenant is not configured with a site ID"); }

    try {
      const {writeToken} = yield this.client.EditContentObject({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId
      });

      let needsFinalize = false;

      for(let draftKey in this.drafts) {
        const draft = this.drafts[draftKey];
        const profile = this.profiles[draftKey];
        const newKey = slugify(draft.name);
        const isDirty = JSON.stringify(draft) !== JSON.stringify(profile);

        if(isDirty) {
          needsFinalize = true;
          try {
            yield this.client.StreamSaveConfigProfile({
              profileMetadata: toJS(draft),
              writeToken,
              finalize: false
            });

            if(profile && draft.name !== profile.name) {
              const libraryId = this.rootStore.dataStore.siteLibraryId;
              const objectId = this.rootStore.dataStore.siteId;

              yield this.client.DeleteFiles({
                libraryId,
                objectId,
                writeToken,
                filePaths: [`live_stream_profiles/${slugify(profile.name)}.json`]
              });

              yield this.client.DeleteMetadata({
                libraryId,
                objectId,
                writeToken,
                metadataSubtree: `public/asset_metadata/profiles/${draftKey}`
              });

              const streamIds = (yield this.client.ContentObjectMetadata({
                libraryId,
                objectId,
                metadataSubtree: `public/asset_metadata/profile_streams/${draftKey}`
              })) ?? [];

              if(streamIds.length > 0) {
                yield this.client.ReplaceMetadata({
                  libraryId,
                  objectId,
                  writeToken,
                  metadataSubtree: `public/asset_metadata/profile_streams/${newKey}`,
                  metadata: streamIds
                });
              }

              yield this.client.DeleteMetadata({
                libraryId,
                objectId,
                writeToken,
                metadataSubtree: `public/asset_metadata/profile_streams/${draftKey}`
              });
            }

            if(draftKey !== newKey) {
              delete this.profiles[draftKey];
              delete this.drafts[draftKey];
              this.profiles[newKey] = {...toJS(draft)};
              this.drafts[newKey] = {...toJS(draft)};
            } else {
              this.profiles[draftKey] = {...toJS(draft)};
            }
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error("Failed to save profile.", error);
          }
        }
      }

      if(needsFinalize) {
        yield this.client.FinalizeContentObject({
          libraryId: this.rootStore.dataStore.siteLibraryId,
          objectId: this.rootStore.dataStore.siteId,
          writeToken,
          commitMessage: "Update config profiles"
        });
      }
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save profiles.", error);
      throw error;
    }
  }
}

export default ProfileStore;
