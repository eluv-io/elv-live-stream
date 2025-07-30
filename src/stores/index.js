import {configure, flow, makeAutoObservable} from "mobx";
import {FrameClient} from "@eluvio/elv-client-js/src/FrameClient";
import DataStore from "@/stores/DataStore";
import StreamStore from "@/stores/StreamStore";
import ModalStore from "@/stores/ModalStore.js";
import StreamManagementStore from "@/stores/StreamManagementStore.js";
import SiteStore from "@/stores/SiteStore.js";

// Force strict mode so mutations are only allowed within actions.
configure({
  enforceActions: "always"
});

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
    this.streamManagementStore = new StreamManagementStore(this);
    this.modalStore = new ModalStore(this);
    this.siteStore = new SiteStore(this);

    this.Initialize();
  }

  Initialize = flow(function * () {
    try {
      this.client = new FrameClient({
        target: window.parent,
        timeout: 900
      });

      window.client = this.client;
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

export const rootStore = new RootStore();
export const dataStore = rootStore.dataStore;
export const streamStore = rootStore.streamStore;
export const streamManagementStore = rootStore.streamManagementStore;
export const modalStore = rootStore.modalStore;
export const siteStore = rootStore.siteStore;

window.rootStore = rootStore;
