// Manages egress output configurations for live streams, including SRT and other output destinations.
import {makeAutoObservable} from "mobx";
import {DeriveSourceAndPackaging, StreamPackaging, StreamSource} from "@/utils/stream";
import {SortTable} from "@/utils/helpers";
import type RootStore from "@/stores/RootStore";

interface OutputInput {
  stream?: string;
  name?: string;
  status?: string;
  url?: string;
  embedUrl?: string;
  source?: StreamSource[];
  packaging?: StreamPackaging[];
  quality?: string;
  stats?: any;
}

interface OutputSrtPull {
  node_ids?: string[];
  urls?: string[];
  connection?: {
    enforced_encryption?: string;
  };
  passphrase?: string;
  strip_rtp?: boolean;
}

interface OutputRtp {
  node_id?: string;
  url?: string;
}

interface Output {
  enabled?: boolean;
  input?: OutputInput;
  name?: string;
  description?: string;
  reset?: boolean;
  rtp?: OutputRtp;
  srt_pull?: OutputSrtPull;
  state?: any;
  tags?: string[];
}

type Outputs = Record<string, Output>;

export type OutputType = "SRT PULL" | "SRT PUSH" | "RTP" | "TS";

const DeriveOutputType = (output: Output): OutputType[] | undefined => {
  const inputProtocol = output.input?.url?.match(/^(\w+):\/\//)?.[1];
  const packaging: OutputType = inputProtocol === "rtp" ? "RTP" : "TS";

  if(output.rtp) return ["RTP"];
  if(output.srt_pull) return ["SRT PULL", packaging];
  return undefined;
};

interface FlatOutput {
  slug: string;
  name?: string;
  description?: string;
  tags?: string[];
  enabled?: boolean;
  reset?: boolean;
  streamId?: string;
  streamName?: string;
  streamStatus?: string;
  url?: string;
  type?: OutputType[];
  packaging?: StreamPackaging[];
  source?: StreamSource[];
  connectedClients: number;
}

class OutputStore {
  state: "loaded" | "error" | "pending" = "pending";
  outputs: Outputs = {};
  outputSettingsId = "";
  tableFilter = "";
  tableTagFilter: string[] = [];
  sortStatus = {columnAccessor: "name", direction: "asc"};
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeAutoObservable(this);
  }

  get client() {
    return this.rootStore.client;
  }

  get allOutputTags(): string[] {
    const tags = new Set<string>();
    Object.values(this.outputs).forEach(output => {
      output.tags?.forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }

  get outputList(): FlatOutput[] {
    const filter = this.tableFilter.toLowerCase();
    const tagFilter = this.tableTagFilter;

    const list = Object.entries(this.outputs)
      .map(([slug, output]): FlatOutput => ({
        slug,
        name: output.name,
        description: output.description,
        tags: output.tags,
        enabled: output.enabled,
        reset: output.reset,
        streamId: output.input?.stream,
        streamName: output.input?.name,
        streamStatus: output.input?.status,
        url: output.srt_pull?.urls?.[0] ?? output.rtp?.url,
        type: DeriveOutputType(output),
        packaging: output.input?.packaging,
        source: output.input?.source,
        connectedClients: output.state?.connected_clients ?? 0,
      }));

    const filtered = list.filter(output => {
      const searchableFields = [
        output.slug,
        output.name,
        output.description,
        output.streamId,
        output.streamName
      ];

      const matchesText = !filter || searchableFields.some(field => field?.toLowerCase().includes(filter));

      const matchesTags = tagFilter.length === 0 || tagFilter.some(tag => output.tags?.includes(tag));

      return matchesText && matchesTags;
    });

    return filtered.sort(SortTable({sortStatus: this.sortStatus}));
  }

  SetTableFilter = (filter: string): void => {
    this.tableFilter = filter;
  };

  SetTableTagFilter = (tags: string[]): void => {
    this.tableTagFilter = tags;
  };

  SetSortStatus = (sortStatus: {columnAccessor: string, direction: string}): void => {
    this.sortStatus = sortStatus;
  };

  UpdateOutput = ({slug, updates}: {slug: string, updates: Partial<Output>}): void => {
    this.outputs[slug] = {...this.outputs[slug], ...updates};
  };

  *LoadOutputSettingsId(): Generator<any, void> {
    try {
      let siteLibraryId = this.rootStore.dataStore.siteLibraryId;
      let siteObjectId = this.rootStore.dataStore.siteId;

      if(!siteLibraryId) {
        ({siteLibraryId, siteObjectId} = yield this.client.StreamSiteSettings({resolveLinks: false}));
      }

      const outputs = yield this.client.ContentObjectMetadata({
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

  *LoadOutputs(): Generator<any, void> {
    try {
      if(!this.outputSettingsId) {
        yield this.LoadOutputSettingsId();
      }

      this.outputs = yield this.client.OutputsList({
        objectId: this.outputSettingsId
      });

      this.state = "loaded";
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load outputs.", error);
      this.state = "error";
    }
  }

  *LoadOutputItem({outputId, includeState=true}: {outputId: string, includeState: boolean}): Generator<any, void> {
    try {
      if(!this.outputSettingsId) {
        yield this.LoadOutputSettingsId();
      }

      const output = yield this.client.OutputsListItem({
        objectId: this.outputSettingsId,
        outputId,
        includeState
      });

      this.UpdateOutput({slug: outputId, updates: output});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load output ${outputId}.`, error);
    }
  }

  *LoadOutputStreamInfo({slug, streamObjectId}: {slug: string, streamObjectId: string}): Generator<any, {url: string, embedUrl: string, source: StreamSource[] | undefined, packaging: StreamPackaging[], quality: string, stats: any}, any> {
    try {
      const metadata = yield this.client.ContentObjectMetadata({
        libraryId: yield this.client.ContentObjectLibraryId({objectId: streamObjectId}),
        objectId: streamObjectId,
        metadataSubtree: "live_recording_config",
        select: [
          "url",
          "recording_config/input_cfg",
        ]
      });

      const streamStatus = yield this.client.StreamStatus({name: streamObjectId});

      const url = metadata?.url;
      const {source, packaging} = DeriveSourceAndPackaging({url, inputCfg: metadata?.recording_config?.input_cfg});

      const embedUrl = yield this.client.EmbedUrl({objectId: streamObjectId, mediaType: "live_video"});

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
              ...this.outputs[slug]?.input,
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

  *CreateOutput({
    name,
    externalId,
    geos,
    passphrase,
    encryption,
    stripRtp
  }: {name?: string, externalId?: string, geos: string[], passphrase?: string, encryption?: string, stripRtp?: boolean}): Generator<any, void> {
    try {
      if(!this.outputSettingsId) {
        throw "No output settings object found. Please create one before adding outputs.";
      }

      if(!name) {
        name = `Output ${this.outputList?.length + 1}`;
      }
      const outputs = yield this.client.OutputsCreate({
        objectId: this.outputSettingsId,
        name,
        description: geos[0],
        externalId,
        enabled: false,
        geos,
        passphrase: passphrase || undefined,
        stripRtp,
        srtConfig: encryption ? {enforced_encryption: encryption} : undefined
      });

      const outputId = Object.keys(outputs || {})[0];
      let outputData = Object.values(outputs || {})[0];

      outputData = yield this.client.OutputsResolveSrtPullUrls({value: outputData});

      this.outputs[outputId] = outputData;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create output.", error);
      throw error;
    }
  }

  *MapStream({outputId, streamObjectId}: {outputId: string, streamObjectId: string}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const existing = yield this.client.ContentObjectMetadata({
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

      yield this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output: JSON.parse(JSON.stringify(updatedOutput))
      });

      const stream = (Object.values(this.rootStore.streamStore.streams || {}) as any[])
        .find(s => s.objectId === streamObjectId);

      this.UpdateOutput({
        slug: outputId,
        updates: {
          enabled: !existing.input?.stream ? true : existing.enabled,
          input: {
            ...(this.outputs[outputId]?.input || {}),
            stream: streamObjectId,
            name: stream?.title,
            status: stream?.status
          }
        }
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to map stream to output.", error);
      throw error;
    }
  }

  *MapStreamBatch({outputs, streamObjectId}: {outputs: string[], streamObjectId: string}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const updatedOutputs = yield Promise.all(
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

      const outputsMap: Record<string, any> = Object.fromEntries(
        updatedOutputs.map(({outputId, output}) => [outputId, JSON.parse(JSON.stringify(output))])
      );

      yield this.client.OutputsModifyBatch({
        libraryId,
        objectId,
        outputs: outputsMap
      });

      const stream = (Object.values(this.rootStore.streamStore.streams || {}) as any[])
        .find(s => s.objectId === streamObjectId);

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
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to map stream to output.", error);
      throw error;
    }
  }

  *UnmapStreamBatch({outputs}: {outputs: string[]}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const updatedOutputs = yield Promise.all(
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

      yield this.client.OutputsModifyBatch({
        libraryId,
        objectId,
        outputs: outputsMap
      });

      updatedOutputs.forEach(({outputId}) => {
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
      console.error("Failed to unmap stream from output.", error);
      throw error;
    }
  }

  *ModifyOutput({
    outputId,
    name,
    passphrase,
    encryption,
    stripRtp,
    tags
  }: {outputId: string, name?: string, passphrase?: string, encryption?: string, stripRtp?: boolean, tags?: string[]}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const existing = yield this.client.OutputsListItem({objectId, outputId, includeState: false});
      // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
      const {name: _n, status: _s, ...cleanInput} = existing.input || {};

      const output = {
        ...existing,
        ...(name !== undefined && {name: name.trim()}),
        ...(tags !== undefined && {tags}),
        input: cleanInput,
        srt_pull: {
          ...existing.srt_pull,
          connection: {
            ...existing.srt_pull.connection,
            enforced_encryption: encryption ?? existing?.srt_pull?.connection?.enforced_encryption
          },
          passphrase: encryption ? (passphrase !== undefined ? (passphrase || undefined) : existing.srt_pull.passphrase) : undefined,
          strip_rtp: stripRtp ?? existing.srt_pull.strip_rtp
        }
      };

      yield this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output
      });

      const updatedOutput = yield this.client.OutputsListItem({objectId, outputId});

      this.UpdateOutput({
        slug: outputId,
        updates: updatedOutput
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update output.", error);
      throw error;
    }
  }

  *EnableOutput({outputId}: {outputId: string}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});
      const enabled = true;

      const existing = yield this.client.ContentObjectMetadata({
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

      yield this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output: JSON.parse(JSON.stringify(updatedOutput))
      });

      this.UpdateOutput({
        slug: outputId,
        updates: { enabled }
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to enable output.", error);
      throw error;
    }
  }

  *EnableOutputBatch({outputs}: {outputs: string[]}): Generator<any, void>{
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const updatedOutputs = yield Promise.all(
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

      yield this.client.OutputsModifyBatch({
        libraryId,
        objectId,
        outputs: outputsMap
      });

      updatedOutputs.forEach(({outputId}) => {
        this.UpdateOutput({
          slug: outputId,
          updates: {
            enabled: true
          }
        });
      });
    }  catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to enable outputs", error);
      throw error;
    }
  }

  *DisableOutput({outputId}: {outputId: string}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});
      const enabled = false;

      const existing = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: `live_outputs/${outputId}`
      }) || {};

      const updatedOutput = {
        ...existing,
        enabled
      };

      yield this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output: JSON.parse(JSON.stringify(updatedOutput))
      });

      this.UpdateOutput({
        slug: outputId,
        updates: { enabled }
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to disable output.", error);
      throw error;
    }
  }

  *DisableOutputBatch({outputs}: {outputs: string[]}): Generator<any, void>{
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const updatedOutputs = yield Promise.all(
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

      yield this.client.OutputsModifyBatch({
        libraryId,
        objectId,
        outputs: outputsMap
      });

      updatedOutputs.forEach(({outputId}) => {
        this.UpdateOutput({
          slug: outputId,
          updates: {
            enabled: false
          }
        });
      });
    }  catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to disable outputs", error);
      throw error;
    }
  }

  *DeleteOutput({outputId}: {outputId: string}): Generator<any, void> {
    const objectId = this.outputSettingsId;
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    try {
      yield this.client.OutputsDelete({
        libraryId,
        objectId,
        outputId
      });

      delete this.outputs[outputId];
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete output.", error);
      throw error;
    }
  }

  *DeleteOutputBatch({outputs}: {outputs: string[]}): Generator<any, void> {
    yield Promise.all(
      outputs.map(outputId => this.DeleteOutput({outputId})
      )
    );
  }

  *UpdateOutputTags({outputId, tags}: {outputId: string, tags: string[]}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const existing = yield this.client.OutputsListItem({objectId, outputId, includeState: false});
      // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
      const {name: _n, status: _s, ...cleanInput} = existing.input || {};

      const output = {
        ...existing,
        input: cleanInput,
        tags
      };

      yield this.client.OutputsModify({
        libraryId,
        objectId,
        outputId,
        output: JSON.parse(JSON.stringify(output))
      });

      this.UpdateOutput({slug: outputId, updates: {tags}});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update output tags.", error);
      throw error;
    }
  }

  *ResetOutput({outputId}: {outputId: string}): Generator<any, void> {
    const objectId = this.outputSettingsId;
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    try {
      yield this.client.OutputsStop({
        libraryId,
        objectId,
        outputId
      });

      const newState = yield this.client.OutputsState({
        libraryId,
        objectId,
        outputId
      });

      this.UpdateOutput({
        slug: outputId,
        updates: {
          state: newState
        }
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete output.", error);
      throw error;
    }
  }
}

export default OutputStore;
