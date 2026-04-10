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

  UpdateOutput = ({slug, updates}) => {
    this.outputs[slug] = {...this.outputs[slug], ...updates};
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

  async LoadOutputStreamInfo({slug, streamObjectId}) {
    try {
      const metadata = await this.client.ContentObjectMetadata({
        libraryId: await this.client.ContentObjectLibraryId({objectId: streamObjectId}),
        objectId: streamObjectId,
        select: [
          "live_recording_config/url",
          "input_cfg/copy_packaging",
          "input_cfg/copy_mode",
          "live_recording/recording_config/recording_params/xc_params/copy_mpegts"
        ]
      });

      const copyMode = metadata?.input_cfg?.copy_mode;
      const copyPackaging = metadata?.input_cfg?.copy_packaging;
      const copyMpegTs = metadata?.live_recording?.recording_config?.recording_params?.xc_params?.copy_mpegts;
      const url = metadata?.live_recording_config?.url;
      const protocol = url.replace(/^\w+:\/\//, "");

      const embedUrl = await this.client.EmbedUrl({objectId: streamObjectId, mediaType: "live_video"});

      const packaging = [], source = [];

      if(copyPackaging === "rtp_ts") {
        packaging.push("rtp");
      }

      if(copyMode === "raw") {
        packaging.push("ts", "fmp4");
      } else if(copyMode === "raw_only") {
        packaging.push("ts");
      }

      if(protocol === "srt") {
        source.push(protocol);
      } else if(protocol === "rtmp") {
        source.push("rtp");
      }

      if(copyMpegTs) {
        source.push("ts");
      }

      const streamInfo = {
        url,
        embedUrl,
        source,
        packaging
      };

      this.UpdateOutput({
        slug,
        updates: {
          input: {
            ...this.outputs[slug].input,
            ...streamInfo
          }
        }
      });

      return streamInfo;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load stream info for output.", error);
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
