import RootStore from "./RootStore.js";
import {configure} from "mobx";

// Force strict mode so mutations are only allowed within actions.
configure({
  enforceActions: "always"
});

export const rootStore = new RootStore();

window.rootStore = rootStore;
window.client = rootStore.client;

export const dataStore = rootStore.dataStore;
export const streamBrowseStore = rootStore.streamBrowseStore;
export const streamManagementStore = rootStore.streamManagementStore;
export const modalStore = rootStore.modalStore;
export const siteStore = rootStore.siteStore;

rootStore.Initialize();
