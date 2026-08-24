import {makeAutoObservable} from "mobx";
import type RootStore from "@/stores/RootStore";

// Manages new-deploy detection: compares the buildId baked into the running
// bundle (__BUILD_ID__) against dist/version.json on the server, and surfaces
// an updateAvailable flag the UI polls to show a "refresh to update" banner.
class VersionStore {
  rootStore: RootStore;
  buildId: string = __BUILD_ID__;
  updateAvailable = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeAutoObservable(this, {rootStore: false}, {autoBind: true});
  }

  *CheckForUpdate(): Generator<any, void> {
    if(this.updateAvailable) { return; }

    try {
      const response = yield fetch(`/version.json?_=${Date.now()}`, {cache: "no-store"});
      if(!response.ok) { return; }

      const {buildId} = yield response.json();

      if(buildId && buildId !== this.buildId) {
        this.updateAvailable = true;
      }
    } catch {
      // Offline or a blip in the request - the next scheduled check will retry.
    }
  }

  Refresh(): void {
    window.location.reload();
  }
}

export default VersionStore;
