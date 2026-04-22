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
export const streamStore = rootStore.streamStore;
export const streamEditStore = rootStore.streamEditStore;
export const modalStore = rootStore.modalStore;
export const siteStore = rootStore.siteStore;
export const profileStore = rootStore.profileStore;
export const outputStore = rootStore.outputStore;
export const outputModalStore = rootStore.outputModalStore;

rootStore.Initialize();