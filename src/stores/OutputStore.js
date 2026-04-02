// Manages egress output configurations for live streams, including SRT and other output destinations.
import {makeAutoObservable} from "mobx";

class OutputStore {
  outputs = {};

  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }

  get outputList() {
    return Object.entries(this.outputs)
      .map(([slug, output]) => ({
        slug,
        ...output
      }));
  }
}

export default OutputStore;
