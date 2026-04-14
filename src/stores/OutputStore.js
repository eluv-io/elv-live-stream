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
      let siteLibraryId = this.rootStore.dataStore.siteLibraryId;
      let siteObjectId = this.rootStore.dataStore.siteId;

      if(!siteLibraryId) {
        ({siteLibraryId, siteObjectId} = await this.client.StreamGetSiteData({resolveLinks: false}));
      }

      const outputs = await this.client.ContentObjectMetadata({
        libraryId: siteLibraryId,
        objectId: siteObjectId,
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
      if(!this.outputSettingsId) {
        await this.LoadOutputSettingsId();
      }
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
      const inputPackaging = metadata?.recording_config?.input_cfg?.input_packaging;
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
          if(inputPackaging === "rtp_ts") {source.splice(1, 0, "rtp");}
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
              enabled: !existing.input?.stream ? true : existing.enabled,
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

      const stream = Object.values(this.rootStore.streamBrowseStore.streams || {})
        .find(s => s.objectId === streamObjectId);

      runInAction(() => {
        updatedOutputs.forEach(({outputId}) => {
          this.UpdateOutput({
            slug: outputId,
            updates: {
              input: {
                ...(this.outputs[outputId]?.input || {}),
                stream: streamObjectId,
                name: stream?.title,
                status: stream?.status
              }
            }
          });
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to map stream to output.", error);
      throw error;
    }
  }
}

export default OutputStore;
