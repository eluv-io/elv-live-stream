import RootStore from "./RootStore";
import {configure} from "mobx";

// Force strict mode so mutations are only allowed within actions.
configure({
  enforceActions: "always"
});

export const rootStore = new RootStore();

window["rootStore"] = rootStore;
window["client"] = rootStore.client;

export const dataStore = rootStore.dataStore;
export const streamStatusStore = rootStore.streamStatusStore;
export const streamDetailStore = rootStore.streamDetailStore;
export const streamListStore = rootStore.streamListStore;
export const streamEditStore = rootStore.streamEditStore;
export const alternateTranscodeStore = rootStore.alternateTranscodeStore;
export const recordingCopyStore = rootStore.recordingCopyStore;
export const streamSaveStore = rootStore.streamSaveStore;
export const modalStore = rootStore.modalStore;
export const settingsStore = rootStore.settingsStore;
export const profileStore = rootStore.profileStore;
export const streamGroupStore = rootStore.streamGroupStore;
export const outputStore = rootStore.outputStore;
export const outputSaveStore = rootStore.outputSaveStore;
export const outputModalStore = rootStore.outputModalStore;
export const versionStore = rootStore.versionStore;

rootStore.Initialize();
