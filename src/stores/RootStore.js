import {configure, flow, makeAutoObservable} from "mobx";
import {FrameClient} from "@eluvio/elv-client-js/src/FrameClient";
import DataStore from "@/stores/DataStore";
import StreamStore from "@/stores/StreamStore.js";
import StreamEditStore from "@/stores/StreamEditStore.js";
import ModalStore from "@/stores/ModalStore.js";
import SiteStore from "@/stores/SiteStore.js";
import ProfileStore from "@/stores/ProfileStore.js";
import OutputStore from "@/stores/OutputStore.js";
import OutputModalStore from "@/stores/OutputModalStore.js";

// Force strict mode so mutations are only allowed within actions.
configure({
  enforceActions: "always"
});

// The central hub, instantiating and coordinating all other MobX stores.
class RootStore {
  client;
  loaded = false;
  networkInfo;
  contentSpaceId;
  errorMessage;

  constructor() {
    makeAutoObservable(this);

    this.dataStore = new DataStore(this);
    this.streamStore = new StreamStore(this);
    this.streamEditStore = new StreamEditStore(this);
    this.modalStore = new ModalStore(this);
    this.siteStore = new SiteStore(this);
    this.profileStore = new ProfileStore(this);
    this.outputStore = new OutputStore(this);
    this.outputModalStore = new OutputModalStore(this);
  }

  Initialize = flow(function * () {
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
  });

  ExecuteFrameRequest = flow(function * ({request, Respond}) {
    Respond(yield this.client.PassRequest({request, Respond}));
  });

  SetErrorMessage(message) {
    this.errorMessage = message;
  }

  async OpenInFabricBrowser({libraryId, objectId}) {
    if(!libraryId) {
      libraryId = await this.client.ContentObjectLibraryId({objectId});
    }

    this.streamStore.client.SendMessage({
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