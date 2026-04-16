// Manages egress output configurations for live streams, including SRT and other output destinations.
import {makeAutoObservable, runInAction} from "mobx";
import {SortTable} from "@/utils/helpers.js";

class OutputStore {
  state = "pending";
  outputs = {};
  outputSettingsId = "";
  tableFilter = "";
  sortStatus = {columnAccessor: "name", direction: "asc"};

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
        streamName: output?.input?.name,
        ...output
      }));

    if(!this.tableFilter) { return list.sort(SortTable({sortStatus: this.sortStatus})); }

    const filter = this.tableFilter.toLowerCase();
    const filtered = list.filter(output =>
      output.slug?.toLowerCase().includes(filter) ||
      output.name?.toLowerCase().includes(filter) ||
      output.description?.toLowerCase().includes(filter) ||
      output.input?.stream?.toLowerCase().includes(filter) ||
      output.input?.name?.toLowerCase().includes(filter)
    );

    return filtered.sort(SortTable({sortStatus: this.sortStatus}));
  }

  SetTableFilter = (filter) => {
    this.tableFilter = filter;
  };

  SetSortStatus = (sortStatus) => {
    this.sortStatus = sortStatus;
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

      const streamStatus = await this.client.StreamStatus({name: streamObjectId});

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
        packaging,
        quality: streamStatus?.quality,
        stats: streamStatus?.input_stats
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
            ...(this.outputs[slug] || {}),
            ...output,
            ...(this.outputs[slug]?.input ? {input: this.outputs[slug].input} : {})
          };
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create output.", error);
    }
  }

  async MapStream({outputId, streamObjectId}) {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = await this.client.ContentObjectLibraryId({objectId});

      const existing = await this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: `live_outputs/${outputId}`
      }) || {};

      const updatedOutput = {
        ...existing,
        enabled: !existing.input?.stream ? true : existing.enabled,
        input: {
          ...(existing.input || {}),
          stream: streamObjectId
        }
      };

      await this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output: JSON.parse(JSON.stringify(updatedOutput))
      });

      const stream = Object.values(this.rootStore.streamBrowseStore.streams || {})
        .find(s => s.objectId === streamObjectId);

      runInAction(() => {
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
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to map stream to output.", error);
      throw error;
    }
  }

  async UnmapStream({outputId}) {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = await this.client.ContentObjectLibraryId({objectId});

      const existing = await this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: `live_outputs/${outputId}`
      }) || {};

      const updatedOutput = {
        ...existing,
        enabled: false,
        input: {}
      };

      await this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output: JSON.parse(JSON.stringify(updatedOutput))
      });

      runInAction(() => {
        this.UpdateOutput({
          slug: outputId,
          updates: {
            enabled: false,
            input: {}
          }
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to map stream to output.", error);
      throw error;
    }
  }

  async MapStreamBatch({outputs, streamObjectId}) {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = await this.client.ContentObjectLibraryId({objectId});

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

      const outputsMap = Object.fromEntries(
        updatedOutputs.map(({outputId, output}) => [outputId, JSON.parse(JSON.stringify(output))])
      );

      await this.client.OutputsModifyBatch({
        libraryId,
        objectId,
        outputs: outputsMap
      });

      const stream = Object.values(this.rootStore.streamBrowseStore.streams || {})
        .find(s => s.objectId === streamObjectId);

      runInAction(() => {
        Object.entries(outputsMap).forEach(([outputId, output]) => {
          this.UpdateOutput({
            slug: outputId,
            updates: {
              enabled: output.enabled,
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

  async UnmapStreamBatch({outputs}) {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = await this.client.ContentObjectLibraryId({objectId});

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
              enabled: false,
              input: null
            }
          };
        })
      );

      const outputsMap = Object.fromEntries(
        updatedOutputs.map(({outputId, output}) => [outputId, JSON.parse(JSON.stringify(output))])
      );

      await this.client.OutputsModifyBatch({
        libraryId,
        objectId,
        outputs: outputsMap
      });

      runInAction(() => {
        updatedOutputs.forEach(({outputId}) => {
          this.UpdateOutput({
            slug: outputId,
            updates: {
              enabled: false,
              input: {}
            }
          });
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to unmap stream from output.", error);
      throw error;
    }
  }
}

export default OutputStore;
