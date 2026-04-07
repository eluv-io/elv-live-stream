// Manages egress output configurations for live streams, including SRT and other output destinations.
import {makeAutoObservable, runInAction} from "mobx";

class OutputStore {
  state = "pending";
  outputs = {};
  tableFilter = "";

  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }

  get outputId() {
    // eslint-disable-next-line no-undef
    return EluvioConfiguration.outputId;
  }

  get outputList() {
    const list = Object.entries(this.outputs)
      .map(([slug, output]) => ({
        slug,
        ...output
      }));

    if(!this.tableFilter) { return list; }

    const filter = this.tableFilter.toLowerCase();
    return list.filter(output =>
      output.name?.toLowerCase().includes(filter) ||
      output.description?.toLowerCase().includes(filter)
    );
  }

  SetTableFilter = ({filter}) => {
    this.tableFilter = filter;
  };

  async LoadOutputs() {
    try {
      const outputs = await this.client.OutputsList({
        // eslint-disable-next-line no-undef
        objectId: EluvioConfiguration.outputId,
        // eslint-disable-next-line no-undef
        srtEndpoints: EluvioConfiguration.srtEndpoints
      });

      runInAction(() => {
        this.outputs = outputs;
        this.state = "loaded";
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load outputs.", error);
      runInAction(() => {
        this.state = "error";
      });
    }
  }

  async CreateOutput({
    name,
    description,
    externalId,
    geos,
    passphrase,
    encryption,
    stripRtp
  }) {
    try {
      if(!name) {
        name = `Output ${this.outputList?.length + 1}`;
      }

      await this.client.OutputsCreate({
        objectId: this.outputId,
        name,
        description,
        externalId,
        geos,
        passphrase,
        stripRtp,
        srtConfig: encryption ? {enforced_encryption: encryption} : undefined
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create output.", error);
    }
  }

  async MapStreamToOutput({outputs, streamObjectId}) {
    try {
      await Promise.all(
        outputs.map(outputId => {
          const output = this.outputs[outputId];

          return this.client.OutputsModify({
            // eslint-disable-next-line no-undef
            objectId: EluvioConfiguration.outputId,
            outputId,
            streamObjectId,
            name: output.name,
            description: output.description,
            enabled: output.enabled,
            reset: output.reset,
            geos: output.geos,
            passphrase: output.srt_pull?.passphrase,
            stripRtp: output.srt_pull?.strip_rtp,
            srtConfig: output.srt_pull?.connection
          });
        })
      );

    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to map stream to output.", error);
    }
  }
}

export default OutputStore;
