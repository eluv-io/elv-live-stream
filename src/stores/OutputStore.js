// Manages egress output configurations for live streams, including SRT and other output destinations.
import {makeAutoObservable, runInAction} from "mobx";

class OutputStore {
  state = "pending";
  outputs = {};
  outputSettingsId = "";
  tableFilter = "";

  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
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

  async LoadOutputSettingsId() {
    try {
      const outputs = await this.client.ContentObjectMetadata({
        libraryId: this.rootStore.dataStore.siteLibraryId,
        objectId: this.rootStore.dataStore.siteId,
        metadataSubtree: "live_outputs"
      });

      this.outputSettingsId = outputs?.[0];
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load output settings object.", error);
    }
  }

  async LoadOutputs() {
    try {
      const outputs = await this.client.OutputsList({
        objectId: this.outputSettingsId,
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
        metadataSubtree: "live_recording_config",
        select: [
          "url",
          "recording_config/input_cfg",
        ]
      });

      const copyMode = metadata?.recording_config?.input_cfg?.copy_mode;
      const copyPackaging = metadata?.recording_config?.input_cfg?.copy_packaging;
      const url = metadata?.url;
      const protocol = url.match(/^(\w+):\/\//)?.[1];

      const embedUrl = await this.client.EmbedUrl({objectId: streamObjectId, mediaType: "live_video"});

      const packaging = [];
      let source;

      if(copyPackaging === "rtp_ts") {
        packaging.push("rtp");
      }

      if(copyMode === "raw") {
        packaging.push("ts", "fmp4");
      } else if(copyMode === "raw_only") {
        packaging.push("ts");
      }

      switch(protocol) {
        case "srt":
          source = ["srt", "ts"];
          if(metadata?.input_cfg?.input_packaging?.rtp_ts) {source = source.splice(1, 0, "rtp");}
          break;
        case "udp":
          source = ["ts"];
          break;
        case "rtp":
          source = ["rtp", "ts"];
          break;
        case "rtmp":
          source = ["rtmp"];
          break;
      }

      const streamInfo = {
        url,
        embedUrl,
        source,
        packaging
      };

      if(slug) {
        this.UpdateOutput({
          slug,
          updates: {
            input: {
              ...this.outputs[slug].input,
              ...streamInfo
            }
          }
        });
      }

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

      const outputs = await this.client.OutputsCreate({
        objectId: this.outputSettingsId,
        name,
        description,
        externalId,
        enabled: false,
        geos,
        passphrase,
        stripRtp,
        srtConfig: encryption ? {enforced_encryption: encryption} : undefined
      });

      runInAction(() => {
        Object.entries(outputs).forEach(([slug, output]) => {
          this.outputs[slug] = {
            ...output,
            ...(this.outputs[slug]?.input ? {input: this.outputs[slug].input} : {})
          };
        });
      });

      const newSlugs = Object.keys(outputs).filter(slug => !this.outputs[slug]?.input?.embedUrl);
      await Promise.all(newSlugs.map(slug => this.LoadOutputStreamInfo({slug})));
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create output.", error);
    }
  }

  async MapStreamToOutput({outputs, streamObjectId}) {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = await this.client.ContentObjectLibraryId({objectId});

      const {writeToken} = await this.client.EditContentObject({
        libraryId,
        objectId
      });

      const updatedOutputs = await Promise.all(
        outputs.map(async outputId => {
          const existing = await this.client.ContentObjectMetadata({
            libraryId,
            objectId,
            metadataSubtree: `live_outputs/${outputId}`
          }) || {};

          return {
            outputId,
            output: {
              ...existing,
              input: {
                ...(existing.input || {}),
                stream: streamObjectId
              }
            }
          };
        })
      );

      await Promise.all(
        updatedOutputs.map(({outputId, output}) =>
          this.client.OutputsModify({
            libraryId,
            objectId,
            outputId,
            writeToken,
            output: JSON.parse(JSON.stringify(output))
          })
        )
      );

      runInAction(() => {
        updatedOutputs.forEach(({outputId, output}) => {
          this.UpdateOutput({slug: outputId, updates: {input: output.input}});
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to map stream to output.", error);
    }
  }
}

export default OutputStore;
