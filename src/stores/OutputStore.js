// Manages egress output configurations for live streams, including SRT and other output destinations.
import {makeAutoObservable, runInAction} from "mobx";
import {DeriveSourceAndPackaging, SortTable} from "@/utils/helpers.js";

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

      const url = metadata?.url;
      const {source, packaging} = DeriveSourceAndPackaging({url, inputCfg: metadata?.recording_config?.input_cfg});

      const embedUrl = await this.client.EmbedUrl({objectId: streamObjectId, mediaType: "live_video"});

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
    externalId,
    geos,
    passphrase,
    encryption,
    stripRtp
  }) {
    try {
      if(!this.outputSettingsId) {
        throw "No output settings object found. Please create one before adding outputs.";
      }

      if(!name) {
        name = `Output ${this.outputList?.length + 1}`;
      }

      const outputs = await this.client.OutputsCreate({
        objectId: this.outputSettingsId,
        name,
        description: geos[0],
        externalId,
        enabled: false,
        geos,
        passphrase,
        stripRtp,
        srtConfig: encryption ? {enforced_encryption: encryption} : undefined
      });

      const outputId = Object.keys(outputs || {})[0];
      let outputData = Object.values(outputs || {})[0];

      outputData = await this.client.OutputsResolveSrtPullUrls({value: outputData});

      runInAction(() => {
        this.outputs[outputId] = outputData;
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create output.", error);
      throw error;
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

      const stream = Object.values(this.rootStore.streamStore.streams || {})
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

      const stream = Object.values(this.rootStore.streamStore.streams || {})
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

  async ModifyOutput({
    outputId,
    name,
    passphrase,
    encryption,
    stripRtp
  }) {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = await this.client.ContentObjectLibraryId({objectId});

      const outputsList = await this.client.OutputsList({
        libraryId,
        objectId,
        includeState: false
      });
      const existing = outputsList?.[outputId];

      const output = {
        ...existing,
        ...(name !== undefined && {name}),
        srt_pull: {
          ...existing.srt_pull,
          connection: {
            ...existing.srt_pull.connection,
            enforced_encryption: encryption ?? existing?.srt_pull?.connection?.enforced_encryption
          },
          passphrase: passphrase ?? existing.srt_pull.passphrase,
          strip_rtp: stripRtp ?? existing.srt_pull.strip_rtp
        }
      };

      await this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output
      });

      runInAction(() => {
        this.UpdateOutput({
          slug: outputId,
          updates: {
            ...(name !== undefined && {name}),
            srt_pull: {
              ...this.outputs[outputId]?.srt_pull,
              connection: {
                ...this.outputs[outputId]?.srt_pull?.connection,
                enforced_encryption: encryption ?? this.outputs[outputId]?.srt_pull?.connection?.enforced_encryption
              },
              passphrase: passphrase ?? this.outputs[outputId]?.srt_pull?.passphrase,
              strip_rtp: stripRtp ?? this.outputs[outputId]?.srt_pull?.strip_rtp
            }
          }
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update output.", error);
      throw error;
    }
  }

  async EnableOutput({outputId}) {
      const objectId = this.outputSettingsId;
      const libraryId = await this.client.ContentObjectLibraryId({objectId});

      const enabled = true;

      const existing = await this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: `live_outputs/${outputId}`
      }) || {};

      if(!existing.input?.stream) {
        throw new Error("A stream must be mapped to the output before enabling");
      }

      const updatedOutput = {
        ...existing,
        enabled
      };

    try {
      await this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output: JSON.parse(JSON.stringify(updatedOutput))
      });

      runInAction(() => {
        this.UpdateOutput({
          slug: outputId,
          updates: { enabled }
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to enable output.", error);
      throw error;
    }
  }

  async EnableOutputBatch({outputs}){
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
              enabled: true
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
              enabled: true
            }
          });
        });
      });
    }  catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to enable outputs", error);
      throw error;
    }
  }

  async DisableOutput({outputId}) {
    const objectId = this.outputSettingsId;
    const libraryId = await this.client.ContentObjectLibraryId({objectId});

    const enabled = false;

    const existing = await this.client.ContentObjectMetadata({
      libraryId,
      objectId,
      metadataSubtree: `live_outputs/${outputId}`
    }) || {};

    const updatedOutput = {
      ...existing,
      enabled
    };

    try {
      await this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output: JSON.parse(JSON.stringify(updatedOutput))
      });

      runInAction(() => {
        this.UpdateOutput({
          slug: outputId,
          updates: { enabled }
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to disable output.", error);
      throw error;
    }
  }

  async DisableOutputBatch({outputs}){
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
              enabled: false
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
              enabled: false
            }
          });
        });
      });
    }  catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to disable outputs", error);
      throw error;
    }
  }

  async DeleteOutput({outputId}) {
    const objectId = this.outputSettingsId;
    const libraryId = await this.client.ContentObjectLibraryId({objectId});

    try {
      await this.client.OutputsDelete({
        libraryId,
        objectId,
        outputId
      });

      runInAction(() => {
        delete this.outputs[outputId];
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete output.", error);
      throw error;
    }
  }

  async DeleteOutputBatch({outputs}) {
    await Promise.all(
      outputs.map(outputId => this.DeleteOutput({outputId})
      )
    );
  }

  async ResetOutput({outputId}) {
    const objectId = this.outputSettingsId;
    const libraryId = await this.client.ContentObjectLibraryId({objectId});

    try {
      await this.client.OutputsStop({
        libraryId,
        objectId,
        outputId
      });

      const newState = await this.client.OutputsState({
        libraryId,
        objectId,
        outputId
      });

      runInAction(() => {
        this.UpdateOutput({
          slug: outputId,
          updates: {
            state: newState
          }
        });
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete output.", error);
      throw error;
    }
  }
}


export default OutputStore;
