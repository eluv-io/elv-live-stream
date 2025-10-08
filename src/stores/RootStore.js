import {configure, flow, makeAutoObservable} from "mobx";
import {FrameClient} from "@eluvio/elv-client-js/src/FrameClient";
import DataStore from "@/stores/DataStore";
import StreamBrowseStore from "@/stores/StreamBrowseStore.js";
import ModalStore from "@/stores/ModalStore.js";
import StreamManagementStore from "@/stores/StreamManagementStore.js";
import SiteStore from "@/stores/SiteStore.js";

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
    this.streamBrowseStore = new StreamBrowseStore(this);
    this.streamManagementStore = new StreamManagementStore(this);
    this.modalStore = new ModalStore(this);
    this.siteStore = new SiteStore(this);
  }

  Initialize = flow(function * () {
    try {
      this.client = new FrameClient({
        target: window.parent,
        timeout: 900
      });

      this.networkInfo = yield this.client.NetworkInfo();
      this.contentSpaceId = yield this.client.ContentSpaceId();

      this.dataStore.Initialize();
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
}

export default RootStore;
