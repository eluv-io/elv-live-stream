// Alternate transcodes: separate content objects that re-transcode a parent stream, listed by id on the parent's live_recording_config.
import {makeAutoObservable} from "mobx";
import {AlternateTranscode, ParseLiveConfigData, ProgramPidSelection} from "@/utils/stream/stream";
import {defaultConfigProfile} from "@/utils/defaultProfile";
import {ALTERNATE_TRANSCODE_PROTOCOLS} from "@/utils/constants";
import type RootStore from "@/stores/RootStore";
import {ResolveIngestNodeId} from "@/stores/lib/fabricNodes";

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

interface AlternateTranscodeFormParams {
  name: string;
  nodeType: "dedicated" | "public";
  node?: string;
  geo?: string;
  protocol: string;
  resolution?: string;
  videoBitrate?: string | number;
  streamBitrate?: string | number;
  advancedEncodingParams?: Record<string, unknown> | null;
  programPidSelection?: ProgramPidSelection;
}

interface CreateAlternateTranscodeParams extends AlternateTranscodeFormParams {
  parentObjectId: string;
  parentLibraryId?: string;
  parentSlug: string;
}

interface UpdateAlternateTranscodeParams extends AlternateTranscodeFormParams {
  objectId: string;
  libraryId?: string;
}

class AlternateTranscodeStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore | Record<string, unknown>) {
    this.rootStore = rootStore as RootStore;
    makeAutoObservable(this, {rootStore: false}, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  // Creates a content object for one alternate transcode (self-referential
  // url `<protocol>://<objectId>`) and appends its id to the parent's
  // alternate_transcodes array, instead of linking it into the site. The
  // object is reserved (Create+Finalize) before StreamCreate since the url
  // needs the objectId, which StreamCreate only returns after completing.
  *CreateAlternateTranscode({
    parentObjectId,
    parentLibraryId,
    parentSlug,
    name,
    nodeType,
    node,
    geo,
    protocol,
    resolution,
    videoBitrate,
    streamBitrate,
    advancedEncodingParams,
    programPidSelection
  }: CreateAlternateTranscodeParams): Generator<any, AlternateTranscode> {
    // Tracked for cleanup if a later step fails
    let objectId: string | undefined;
    let nodeWriteToken: string | undefined;

    try {
      if(!parentLibraryId) {
        parentLibraryId = yield this.client.ContentObjectLibraryId({objectId: parentObjectId});
      }

      const {contentTypes} = yield this.rootStore.dataStore.LoadTenantSiteData();

      // alternate_transcodes is appended to below; probe_info seeds
      // input_stream_info below.
      const parentConfig = yield this.client.ContentObjectMetadata({
        libraryId: parentLibraryId,
        objectId: parentObjectId,
        metadataSubtree: "live_recording_config",
        select: ["alternate_transcodes", "probe_info"]
      });
      const existingIds: string[] = parentConfig?.alternate_transcodes ?? [];
      const parentProbeInfo = parentConfig?.probe_info;

      // Dedicated nodes use the node picked in the modal directly; public
      // nodes resolve one from the chosen geo (see lib/fabricNodes).
      const resolvedNodeId = nodeType === "dedicated" ?
        node :
        (geo ? yield ResolveIngestNodeId({client: this.client, geo}) : undefined);

      const createResponse = yield this.client.CreateContentObject({
        libraryId: parentLibraryId,
        options: contentTypes?.live_stream ? {type: contentTypes.live_stream} : {}
      });
      // Object exists from here on; the finalize below commits it
      objectId = createResponse.id as string;

      yield this.client.FinalizeContentObject({
        libraryId: parentLibraryId,
        objectId,
        writeToken: createResponse.writeToken,
        awaitCommitConfirmation: true,
        commitMessage: "Reserve alternate transcode object"
      });

      const inputStreamToken = yield this.client.CreateSignedToken({
        objectId: parentObjectId,
        duration: ONE_MONTH_MS
      });

      const baseProfile = {
        ...defaultConfigProfile,
        recording_params: {
          ...defaultConfigProfile.recording_params,
          input_stream: {stream: parentObjectId, token: inputStreamToken}
        }
      };
      const configProfile = (resolvedNodeId && parentProbeInfo) ?
        {...baseProfile, input_stream_info: parentProbeInfo} :
        baseProfile;

      yield this.client.StreamCreate({
        libraryId: parentLibraryId,
        objectId,
        url: `${protocol}://${objectId}`,
        // Base config from the built-in profile; per-transcode fields
        // (bitrate, resolution) are overwritten below in SaveConfigMetadata.
        // With a resolved node and a probed parent, input_stream_info above
        // makes StreamCreate run its internal StreamConfig pass.
        liveRecordingConfig: ParseLiveConfigData({configProfile}),
        options: {
          name,
          displayTitle: name,
          permission: "editable",
          ingressNodeId: resolvedNodeId,
          linkToSite: false
        }
      });

      // Also write ingress_node_id/geo directly (like SaveAlternateTranscode),
      // since StreamCreate's own write goes through several merge layers.
      ({writeToken: nodeWriteToken} = yield this.client.EditContentObject({libraryId: parentLibraryId, objectId}));
      yield this.client.MergeMetadata({
        libraryId: parentLibraryId,
        objectId,
        writeToken: nodeWriteToken,
        metadataSubtree: "live_recording_config",
        metadata: {
          url: `${protocol}://${objectId}`,
          ingress_node_id: resolvedNodeId ?? null,
          geo: nodeType === "public" ? geo : null
        }
      });
      yield this.client.FinalizeContentObject({
        libraryId: parentLibraryId,
        objectId,
        writeToken: nodeWriteToken,
        awaitCommitConfirmation: true,
        commitMessage: "Set alternate transcode node"
      });
      nodeWriteToken = undefined;

      yield this.rootStore.streamEditStore.SaveConfigMetadata({
        objectId,
        libraryId: parentLibraryId,
        resolution,
        videoBitrate,
        streamBitrate,
        advancedEncodingParams,
        programPidSelection
      });

      yield this.rootStore.streamEditStore.SaveConfigMetadata({
        objectId: parentObjectId,
        libraryId: parentLibraryId,
        slug: parentSlug,
        alternateTranscodes: [...existingIds, objectId]
      });

      return {
        id: objectId,
        name,
        nodeType,
        node,
        geo,
        resolvedNodeId,
        protocol,
        resolution,
        videoBitrate,
        streamBitrate,
        advancedEncodingParams: advancedEncodingParams ?? null,
        programPidSelection
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create alternate transcode", error);

      if(nodeWriteToken) {
        try {
          yield this.client.DeleteWriteToken({writeToken: nodeWriteToken});
        } catch(discardError) {
          // eslint-disable-next-line no-console
          console.error("Failed to discard write token", discardError);
        }
      }

      if(objectId) {
        try {
          // Skip the delete if the parent already references it (e.g. a finalize that failed after committing)
          const parentConfig = yield this.client.ContentObjectMetadata({
            libraryId: parentLibraryId,
            objectId: parentObjectId,
            metadataSubtree: "live_recording_config",
            select: ["alternate_transcodes"]
          });

          if(!(parentConfig?.alternate_transcodes ?? []).includes(objectId)) {
            yield this.client.DeleteContentObject({libraryId: parentLibraryId, objectId});
          }
        } catch(cleanupError) {
          // eslint-disable-next-line no-console
          console.error(`Failed to remove partially created alternate transcode ${objectId}`, cleanupError);
        }
      }

      throw error;
    }
  }

  // Rewrites an alternate transcode's own object (name, node/url,
  // recording_config); doesn't touch the parent's alternate_transcodes array.
  *SaveAlternateTranscode({
    objectId,
    libraryId,
    name,
    nodeType,
    node,
    geo,
    protocol,
    resolution,
    videoBitrate,
    streamBitrate,
    advancedEncodingParams,
    programPidSelection
  }: UpdateAlternateTranscodeParams): Generator<any, AlternateTranscode> {
    let writeToken: string | undefined;

    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      ({writeToken} = yield this.client.EditContentObject({libraryId, objectId}));

      const existingConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config",
        select: ["ingress_node_id", "probe_info"]
      });

      // Same dedicated/public resolution as CreateAlternateTranscode.
      const resolvedNodeId = nodeType === "dedicated" ?
        node :
        (geo ? yield ResolveIngestNodeId({client: this.client, geo}) : undefined);

      const nodeChanged = (resolvedNodeId ?? null) !== (existingConfig?.ingress_node_id ?? null);

      yield this.client.MergeMetadata({
        libraryId,
        objectId,
        writeToken,
        metadata: {
          public: {name},
          live_recording_config: {
            url: `${protocol}://${objectId}`,
            ingress_node_id: resolvedNodeId ?? null,
            geo: nodeType === "public" ? geo : null
          }
        }
      });

      // Re-derive live_recording's fabric_config (ingress_node_api/id) for
      // the new node - otherwise start/stop/restart keep targeting the old
      // one. Only when there's already probe data to reuse; without it
      // StreamConfig would try (and likely fail) to probe this object's own,
      // probably inactive, url.
      if(nodeChanged && resolvedNodeId && existingConfig?.probe_info) {
        yield this.client.StreamConfig({
          name: objectId,
          writeToken,
          finalize: false,
          inputStreamInfo: existingConfig.probe_info
        });
      }

      yield this.rootStore.streamEditStore.SaveConfigMetadata({
        objectId,
        libraryId,
        writeToken,
        resolution,
        videoBitrate,
        streamBitrate,
        advancedEncodingParams,
        programPidSelection,
        finalize: true
      });

      return {
        id: objectId,
        name,
        nodeType,
        node,
        geo,
        resolvedNodeId,
        protocol,
        resolution,
        videoBitrate,
        streamBitrate,
        advancedEncodingParams: advancedEncodingParams ?? null,
        programPidSelection
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update alternate transcode", error);

      if(writeToken) {
        try {
          yield this.client.DeleteWriteToken({writeToken});
        } catch(discardError) {
          // eslint-disable-next-line no-console
          console.error("Failed to discard write token", discardError);
        }
      }

      throw error;
    }
  }

  // Removes the id from the parent's alternate_transcodes array first (so a
  // failed delete never leaves a broken reference), then deletes the object;
  // delete failures are logged and swallowed.
  *RemoveAlternateTranscode({
    parentObjectId,
    parentLibraryId,
    parentSlug,
    id
  }: {parentObjectId: string, parentLibraryId?: string, parentSlug: string, id: string}): Generator<any, void> {
    if(!parentLibraryId) {
      parentLibraryId = yield this.client.ContentObjectLibraryId({objectId: parentObjectId});
    }

    const existingConfig = yield this.client.ContentObjectMetadata({
      libraryId: parentLibraryId,
      objectId: parentObjectId,
      metadataSubtree: "live_recording_config",
      select: ["alternate_transcodes"]
    });
    const existingIds: string[] = existingConfig?.alternate_transcodes ?? [];

    yield this.rootStore.streamEditStore.SaveConfigMetadata({
      objectId: parentObjectId,
      libraryId: parentLibraryId,
      slug: parentSlug,
      alternateTranscodes: existingIds.filter(existingId => existingId !== id)
    });

    try {
      yield this.client.DeleteContentObject({
        libraryId: yield this.client.ContentObjectLibraryId({objectId: id}),
        objectId: id
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.log(`Content object ${id} has already been deleted. Removed from the alternate transcodes list.`, error);
    }
  }

  // Each id is a separate content object; resolved in parallel with per-id
  // failure isolation so a broken reference still renders (and stays
  // removable) instead of vanishing from the table.
  *ResolveAlternateTranscodes({libraryId, ids}: {libraryId: string, ids: string[]}): Generator<any, AlternateTranscode[]> {
    if(!ids || ids.length === 0) { return []; }

    const results = yield Promise.all(ids.map(async(id): Promise<AlternateTranscode> => {
      const [name, configMeta, xcParams] = await Promise.all([
        (async() => {
          try {
            const generalMeta = await this.client.ContentObjectMetadata({
              libraryId,
              objectId: id,
              metadataSubtree: "public",
              select: ["name"]
            });
            return generalMeta?.name || id;
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error(`Unable to load name for alternate transcode ${id}`, error);
            return id;
          }
        })(),
        (async() => {
          try {
            return (await this.client.ContentObjectMetadata({
              libraryId,
              objectId: id,
              metadataSubtree: "live_recording_config",
              select: ["url", "ingress_node_id", "geo", "recording_config", "recording_params"]
            })) || {};
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error(`Unable to load config for alternate transcode ${id}`, error);
            return {};
          }
        })(),
        (async(): Promise<Record<string, any>> => {
          try {
            return (await this.client.ContentObjectMetadata({
              libraryId,
              objectId: id,
              metadataSubtree: "live_recording/recording_config/recording_params/xc_params"
            })) || {};
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error(`Unable to load applied encoding config for alternate transcode ${id}`, error);
            return {};
          }
        })()
      ]);

      const url: string = configMeta.url || "";
      const ingressNodeId = configMeta.ingress_node_id;
      const geo = configMeta.geo;
      const recordingConfig: Record<string, any> = configMeta.recording_config || {};
      const advancedEncodingParams: Record<string, unknown> | null = configMeta.recording_params?.xc_params ?? null;

      const protocol = (url.split("://")[0]) || ALTERNATE_TRANSCODE_PROTOCOLS[0]?.value || "";

      return {
        id,
        name,
        // geo (only ever set on public transcodes) distinguishes the two,
        // since both now carry a resolved ingress_node_id.
        nodeType: geo ? "public" : "dedicated",
        node: geo ? undefined : ingressNodeId,
        geo,
        resolvedNodeId: ingressNodeId,
        protocol,
        resolution: xcParams.enc_height ? `${xcParams.enc_height}p` : undefined,
        videoBitrate: xcParams.video_bitrate,
        streamBitrate: xcParams.input_cfg?.stream_bitrate,
        advancedEncodingParams,
        programPidSelection: recordingConfig.program_pid_selection ?? {activeProgramId: null, selections: {}}
      };
    }));

    return results;
  }
}

export default AlternateTranscodeStore;
