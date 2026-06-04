import {configure, makeAutoObservable} from "mobx";
import {FrameClient} from "@eluvio/elv-client-js/src/FrameClient";
import DataStore from "@/stores/DataStore";
import StreamStore from "@/stores/StreamStore";
import StreamEditStore from "@/stores/StreamEditStore";
import ModalStore from "@/stores/ModalStore";
import SiteStore from "@/stores/SiteStore";
import ProfileStore from "@/stores/ProfileStore";
import OutputStore from "@/stores/OutputStore";
import OutputModalStore from "@/stores/OutputModalStore";

// Force strict mode so mutations are only allowed within actions.
configure({
  enforceActions: "always"
});

// The central hub, instantiating and coordinating all other MobX stores.
class RootStore {
  client: InstanceType<typeof FrameClient>;
  loaded = false;
  networkInfo?: {
    name: "demo" | "main" | "test",
    id: string,
    configUrl: string
  };
  contentSpaceId?: string;
  errorMessage?: string;

  dataStore: DataStore;
  streamStore: StreamStore;
  streamEditStore: StreamEditStore;
  modalStore: ModalStore;
  siteStore: SiteStore;
  profileStore: ProfileStore;
  outputStore: OutputStore;
  outputModalStore: OutputModalStore;

  constructor() {
    this.dataStore = new DataStore(this);
    this.streamStore = new StreamStore(this);
    this.streamEditStore = new StreamEditStore(this);
    this.modalStore = new ModalStore(this);
    this.siteStore = new SiteStore(this);
    this.profileStore = new ProfileStore(this);
    this.outputStore = new OutputStore(this);
    this.outputModalStore = new OutputModalStore(this);

    makeAutoObservable(this);
  }

  *Initialize(): Generator<any, void> {
    try {
      this.client = new FrameClient({
        target: window.parent,
        timeout: 900
      });

      this.networkInfo = yield this.client.NetworkInfo();
      this.contentSpaceId = yield this.client.ContentSpaceId();

      yield this.dataStore.Initialize();
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
