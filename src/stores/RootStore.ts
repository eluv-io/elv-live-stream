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
