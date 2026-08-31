import {configure, makeAutoObservable} from "mobx";
import {FrameClient} from "@eluvio/elv-client-js/src/FrameClient";
import DataStore from "@/stores/DataStore";
import StreamStore from "@/stores/StreamStore";
import StreamEditStore from "@/stores/StreamEditStore";
import ModalStore from "@/stores/ModalStore";
import SiteStore from "@/stores/SiteStore";
import ProfileStore from "@/stores/ProfileStore";
import StreamGroupStore from "@/stores/StreamGroupStore";
import OutputStore from "@/stores/OutputStore";
import OutputModalStore from "@/stores/OutputModalStore";
import UserSettingsStore from "@/stores/UserSettingsStore";
import StreamSaveStore from "@/stores/StreamSaveStore";
import OutputSaveStore from "@/stores/OutputSaveStore";
import VersionStore from "@/stores/VersionStore";

// Force strict mode so mutations are only allowed within actions.
configure({
  enforceActions: "always"
});

export type NetworkName = "demo" | "main" | "test";

// The central hub, instantiating and coordinating all other MobX stores.
class RootStore {
  client: InstanceType<typeof FrameClient>;
  loaded = false;
  networkInfo?: {
    name: NetworkName,
    id: string,
    configUrl: string
  };
  contentSpaceId?: string;
  errorMessage?: string;

  dataStore: DataStore;
  streamStore: StreamStore;
  streamEditStore: StreamEditStore;
  streamSaveStore: StreamSaveStore;
  modalStore: ModalStore;
  siteStore: SiteStore;
  profileStore: ProfileStore;
  streamGroupStore: StreamGroupStore;
  outputStore: OutputStore;
  outputSaveStore: OutputSaveStore;
  outputModalStore: OutputModalStore;
  userSettingsStore: UserSettingsStore;
  versionStore: VersionStore;

  constructor() {
    this.dataStore = new DataStore(this);
    this.streamStore = new StreamStore(this);
    this.streamEditStore = new StreamEditStore(this);
    this.streamSaveStore = new StreamSaveStore(this);
    this.modalStore = new ModalStore(this);
    this.siteStore = new SiteStore(this);
    this.profileStore = new ProfileStore(this);
    this.streamGroupStore = new StreamGroupStore(this);
    this.outputStore = new OutputStore(this);
    this.outputSaveStore = new OutputSaveStore(this);
    this.outputModalStore = new OutputModalStore(this);
    this.userSettingsStore = new UserSettingsStore(this);
    this.versionStore = new VersionStore(this);

    makeAutoObservable(this);
  }

  *Initialize(): Generator<any, void> {
    try {
      this.client = new FrameClient({
        target: window.parent,
        timeout: 180
      });

      this.networkInfo = yield this.client.NetworkInfo();
      this.contentSpaceId = yield this.client.ContentSpaceId();

      yield Promise.all([
        this.dataStore.Initialize(),
        this.userSettingsStore.Load()
      ]);

      this.streamStore.RestoreTableTagFilter(this.userSettingsStore.settings.tableFilters.streams);
      this.outputStore.RestoreTableTagFilter(this.userSettingsStore.settings.tableFilters.outputs);

      // The tenant-wide live-stream query is scoped by siteId (group:eq:<siteId>), so it can't
      // fire until site settings (dataStore.Initialize -> LoadTenantSiteData) have resolved siteId.
      // Only used when the site opts into the content-group query; kick it off here (not awaited)
      // so it's in flight before the streams page mounts; LoadSiteStreams picks up the same
      // in-flight promise via the filter-key cache.
      if(this.dataStore.useContentGroup) {
        this.streamStore.LoadTenantLiveStreamContent({
          siteId: this.dataStore.siteId,
          dateRange: this.dataStore.useDateFilter ? this.streamStore.dateRangeFilter : [null, null],
          paged: true
        });
      }
    } catch(error) {
      /* eslint-disable no-console */
      console.error("Failed to initialize application");
      console.error(error);

    } finally {
      this.loaded = true;
    }
  }

  *ExecuteFrameRequest ({request, Respond}: any) : Generator<any, void> {
    Respond(yield this.client.PassRequest({request, Respond}));
  }

  SetErrorMessage(message: string): void {
    this.errorMessage = message;
  }

  async OpenInFabricBrowser({libraryId, objectId}: {libraryId: string, objectId: string}): Promise<void> {
    if(!libraryId) {
      libraryId = await this.client.ContentObjectLibraryId({objectId});
    }

    await this.streamStore.client.SendMessage({
      options: {
        operation: "OpenLink",
        libraryId,
        objectId
      },
      noResponse: true
    });
  }
}

export default RootStore;
