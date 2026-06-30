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
  elvgeos?: string[];
  connection?: {
    enforced_encryption?: string;
  };
  passphrase?: string;
  strip_rtp?: boolean;
}

interface OutputSrtPush {
  node_id?: string;
  url?: string;
  elvgeo?: string;
  location?: "global" | "elvgeo" | "datacenter" | "nid";
  connection?: {
    enforced_encryption?: string;
  };
  passphrase?: string;
  strip_rtp?: boolean;
}

interface OutputRtp {
  node_id?: string;
  url?: string;
  elvgeo?: string;
}

// Raw output as stored in stream metadata: nested, keyed by transport (rtp/udp/srt_*).
interface Output {
  enabled?: boolean;
  input?: OutputInput;
  name?: string;
  description?: string;
  rtp?: OutputRtp;
  udp?: OutputRtp;
  srt_pull?: OutputSrtPull;
  srt_push?: OutputSrtPush;
  state?: any;
  tags?: string[];
}

type Outputs = Record<string, Output>;

export type OutputType = "SRT PULL" | "SRT PUSH" | "RTP" | "UDP" | "TS";

const DeriveOutputType = (output: Output, streamSource?: string[]): OutputType[] | undefined => {
  const stripRtp = output.srt_pull?.strip_rtp ?? output.srt_push?.strip_rtp;
  const packaging: OutputType = streamSource?.includes("rtp") && !stripRtp ? "RTP" : "TS";

  if(output.rtp) return ["RTP"];
  if(output.udp) return ["UDP"];
  if(output.srt_push) return ["SRT PUSH", packaging];
  if(output.srt_pull) return ["SRT PULL", packaging];
  return undefined;
};

// Output flattened for the UI: url/type/source pulled up out of the transport nesting,
// plus the owning stream's id/name/status added on, for table rows.
interface FlatOutput {
  slug: string;
  name?: string;
  description?: string;
  tags?: string[];
  enabled?: boolean;
  streamId?: string;
  streamName?: string;
  streamStatus?: string;
  url?: string;
  type?: OutputType[];
  packaging?: string[];
  source?: string[];
  connectedClients: number;
  input?: OutputInput;
}

interface CreateOutputParams {
  name?: string;
  externalId?: string;
  offering?: string;
  // Public outputs target a fabric region; dedicated outputs target a specific node.
  region?: string;
  node?: string;
  passphrase?: string;
  encryption?: string;
  stripRtp?: boolean;
  url?: string;
  type: "srt_pull" | "srt_push" | "rtp" | "udp"
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

  // Flatten a raw output into the derived shape used by tables and detail views.
  FlattenOutput = (slug: string, output: Output): FlatOutput => {
    const {streamsByObjectId, streams} = this.rootStore.streamStore;
    const streamSlug = output.input?.stream ? streamsByObjectId[output.input.stream] : undefined;
    // srt_pull.urls is an array of strings; other output types store a single url string.
    const url = output.srt_pull?.urls?.[0] ?? output.srt_push?.url ?? output.rtp?.url ?? output.udp?.url;

    return {
      slug,
      name: output.name,
      description: output.description,
      tags: output.tags,
      enabled: output.enabled,
      streamId: output.input?.stream,
      streamName: output.input?.name,
      streamStatus: output.input?.status,
      url,
      type: DeriveOutputType(output, streams?.[streamSlug]?.source ?? output.input?.source),
      packaging: streams?.[streamSlug]?.packaging ?? output.input?.packaging,
      source: streams?.[streamSlug]?.source ?? output.input?.source,
      connectedClients: output.state?.connected_clients ?? 0,
      input: output.input
    };
  };

  // Individualized version of outputList for a single output by slug.
  OutputItem = (slug: string): FlatOutput | undefined => {
    const output = this.outputs[slug];
    if(!output) { return undefined; }

    return this.FlattenOutput(slug, output);
  };

  get outputList(): FlatOutput[] {
    const filter = this.tableFilter.toLowerCase();
    const tagFilter = this.tableTagFilter;

    const list = Object.entries(this.outputs)
      .map(([slug, output]): FlatOutput => this.FlattenOutput(slug, output));

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

  // Fetch a single output's live egress state. Mirrors StreamStore.CheckStatus:
  // pass update=true to merge the fresh state onto the stored output so derived
  // table columns (connected_clients, etc.) react without a full OutputsList
  // reload. Only `state` is merged so the enriched input fields added by
  // LoadOutputStreamInfo and the persisted config aren't clobbered.
  *CheckOutputState({outputId, update=false}: {outputId: string, update?: boolean}): Generator<any, any> {
    let response;
    try {
      response = yield this.client.OutputsState({
        objectId: this.outputSettingsId,
        outputId
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load state for output ${outputId}.`, error);
      return {};
    }
    if(update) {
      this.UpdateOutput({
        slug: outputId,
        updates: {
          state: response?.state
        }
      });
    }

    return response;
  }

  // Resilient per-output state refresh for polling. Unlike LoadOutputs (a single
  // OutputsList call that replaces the whole map and is all-or-nothing — one
  // thrown enrichment/route step leaves every output stale), this updates each
  // output independently so one failure can't block the rest.
  //
  // MUST run sequentially: OutputsState reroutes the shared client to each
  // output's egress node (RouteToLiveEgress / RouteToOutputNode) and restores
  // afterward. Concurrent calls corrupt each other's routing and fail their
  // state reads.
  *AllOutputsState(): Generator<any, void> {
    try {
      for(const outputId of Object.keys(this.outputs || {})) {
        try {
          yield this.CheckOutputState({outputId, update: true});
        } catch(error) {
          // eslint-disable-next-line no-console
          console.error(`Skipping state for output ${outputId}.`, error);
        }
      }
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to refresh output states.", error);
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

      // OutputsListItem returns a sparse `input` (stream/name/status). Merge it
      // onto the existing input so the live fields added by LoadOutputStreamInfo
      // (source, packaging, quality, stats, url, embedUrl) aren't clobbered when
      // the item is (re)loaded. A null/undefined input (unmapped) passes through.
      this.UpdateOutput({
        slug: outputId,
        updates: {
          ...output,
          input: output?.input
            ? {...this.outputs[outputId]?.input, ...output.input}
            : output?.input
        }
      });
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
    offering,
    region,
    node,
    passphrase,
    encryption,
    stripRtp,
    url,
    type
  }: CreateOutputParams): Generator<any, void> {
    try {
      if(!this.outputSettingsId) {
        throw "No output settings object found. Please create one before adding outputs.";
      }

      if(!name) {
        name = `Output ${this.outputList?.length + 1}`;
      }

      const isSrt = type === "srt_pull" || type === "srt_push";
      // srt_pull accepts arrays of nodes/geos; srt_push/rtp/udp use a single node/geo.
      const isPull = type === "srt_pull";

      const settings: Record<string, any> = {};

      if(node) {
        settings[isPull ? "node_ids" : "node_id"] = isPull ? [node] : node;
      }

      if(region) {
        settings[isPull ? "elvgeos" : "elvgeo"] = isPull ? [region] : region;
      }

      if(url) { settings.url = url; }

      if(isSrt) {
        settings.passphrase = passphrase || undefined;
        settings.strip_rtp = stripRtp;
        settings.connection = encryption ? {enforced_encryption: encryption} : undefined;
      }

      const outputs = yield this.client.OutputsCreate({
        objectId: this.outputSettingsId,
        offering,
        name,
        description: node || region,
        externalId,
        enabled: false,
        delivery: {
          type,
          settings
        }
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
    // tags
  }: {outputId: string, name?: string, passphrase?: string, encryption?: string, stripRtp?: boolean, tags?: string[]}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const existing = yield this.client.OutputsListItem({objectId, outputId, includeState: false});
      // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
      const {name: _n, status: _s, ...cleanInput} = existing.input || {};
      // reset/state are transient runtime fields surfaced by OutputsListItem; a config
      // edit must not persist them back
      // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
      const {state: _st, ...cleanExisting} = existing;

      // Encryption/passphrase/strip_rtp live on the SRT block, which is keyed by
      // srt_pull or srt_push depending on the output type. RTP/UDP outputs have no
      // SRT block, so building one would pollute the payload.
      const srtKey = existing.srt_pull ? "srt_pull" : existing.srt_push ? "srt_push" : undefined;
      const existingSrt = srtKey ? existing[srtKey] : undefined;

      const output = {
        ...cleanExisting,
        ...(name !== undefined && {name: name.trim()}),
        // ...(tags !== undefined && {tags}),
        input: cleanInput,
        ...(srtKey && {
          [srtKey]: {
            ...existingSrt,
            connection: {
              ...existingSrt?.connection,
              enforced_encryption: encryption ?? existingSrt?.connection?.enforced_encryption
            },
            passphrase: encryption ? (passphrase !== undefined ? (passphrase || undefined) : existingSrt?.passphrase) : undefined,
            strip_rtp: stripRtp ?? existingSrt?.strip_rtp
          }
        })
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
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      yield this.client.OutputsDeleteBatch({
        libraryId,
        objectId,
        outputs
      });

      outputs.forEach(outputId => {
        delete this.outputs[outputId];
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete outputs (batch).", error);
      throw error;
    }
  }

  *UpdateOutputTags({outputId, tags}: {outputId: string, tags: string[]}): Generator<any, void> {
    try {
      const objectId = this.outputSettingsId;
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const existing = yield this.client.OutputsListItem({objectId, outputId, includeState: false});
      // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
      const {name: _n, status: _s, ...cleanInput} = existing.input || {};
      // reset/state are transient runtime fields surfaced by OutputsListItem; never persist them.
      // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
      const {reset: _r, state: _st, ...cleanExisting} = existing;

      const output = {
        ...cleanExisting,
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
