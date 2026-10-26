// Stream writes: create, duplicate, delete, permissions, config saves (general/recording/playout), profiles, watermarks, DRM, audio, and tags.
import {makeAutoObservable, toJS} from "mobx";
import {
  DeriveCopyMode,
  DeriveCopyPackaging,
  FinalizeContentObjectResponse,
  ForensicWatermark,
  ImageWatermark,
  LadderSpec,
  LiveRecordingConfigProfile,
  ParseLiveConfigData,
  ProgramPidSelection,
  RecordingInputCfg,
  SimpleWatermark,
  StreamRecord
} from "@/utils/stream/stream";
import {PlayoutFormat, RESOLUTION_DIMENSIONS, STATUS_MAP, StreamStatus} from "@/utils/constants";
import {slugify} from "@/utils/helpers";
import {ResolveIngestNodeId} from "@/stores/lib/fabricNodes";
import {WithWriteToken} from "@/utils/fabric/withWriteToken";
import type RootStore from "@/stores/RootStore";
import type {AudioDataMap, ProbeData} from "@/stores/streams/StreamDetailStore";
import {PermissionLevel} from "@/stores/TenantStore";

// Empty clears the value (null); anything else must be a positive integer
const ParseBitrate = (value: string | number, label: string): number | null => {
  if(typeof value === "string" && !value.trim()) { return null; }

  const bitrate = Number(value);
  if(!Number.isInteger(bitrate) || bitrate <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return bitrate;
};

interface InitLiveStreamObjectParams {
  objectId: string;
  accessGroup: string;
  description: string;
  displayTitle: string;
  encryption: PlayoutFormat[];
  libraryId: string;
  name: string;
  nodeId: string;
  permission: string;
  configProfile: LiveRecordingConfigProfile;
  retention: number | string;
  persistent: boolean;
  url: string;
}

interface DuplicateStreamParams {
  libraryId: string;
  originalVersionHash: string;
  originalSlug: string;
  name: string;
  url: string;
  nodeId: string;
}

interface UpdateDetailMetadataParams {
  libraryId?: string;
  objectId: string;
  writeToken: string;
  finalize: boolean;
  name: string;
  url: string;
  description: string;
  displayTitle: string;
  slug: string;
  tags?: string[];
}

interface UpdateConfigMetadataParams {
  libraryId?: string;
  objectId?: string;
  writeToken?: string;
  finalize?: boolean;
  slug?: string;
  retention?: string;
  persistent?: boolean;
  connectionTimeout?: string;
  reconnectionTimeout?: string;
  skipDvrSection?: boolean;
  dvrEnabled?: boolean;
  dvrStartTime?: number;
  dvrMaxDuration?: string;
  copyMpegTs?: boolean;
  fabricPackagingFMP4?: boolean;
  fabricPackagingMpegTs?: boolean;
  inputPackaging?: RecordingInputCfg;
  copyPackaging?: "raw_ts" | "rtp_ts";
  customReadLoop?: boolean;
  audioData?: AudioDataMap;
  multiPathEnabled?: boolean;
  // Assumed shape, pending fabric-team confirmation - see the Alternate
  // Transcodes / Program-PID-Selection design note in CLAUDE.md. Written via
  // the same ReplaceMetadata call as the fields above, so it won't hard-
  // reject, but may be silently ignored by the recording pipeline until it's
  // extended to read these fields (same risk already documented for ats_ts).
  copyPackagingFormats?: string[];
  alternateTranscodeEnabled?: boolean;
  // Ids of the alternate transcodes' own content objects - see
  // AlternateTranscodeStore.
  alternateTranscodes?: string[];
  // Only used when objectId targets an alternate transcode's own object.
  resolution?: string;
  // videoBitrate/streamBitrate are written to
  // live_recording/recording_config/recording_params/xc_params, not the
  // recording_config above.
  videoBitrate?: string | number;
  streamBitrate?: string | number;
  programPidSelection?: ProgramPidSelection;
  // Replaces live_recording_config/recording_params/xc_params; empty/null/undefined is a no-op.
  advancedEncodingParams?: Record<string, unknown> | null;
}

interface UpdateGeneralConfigParams {
  objectId: string;
  libraryId?: string;
  writeToken?: string;
  slug: string;
  configProfile?: string;
  updatePermission?: boolean;
  updateAccessGroup?: boolean;
  removeAccessGroup?: string;
  formData: {
    accessGroup: string;
    name: string;
    url: string;
    description: string;
    displayTitle: string;
    permission: PermissionLevel;
    tags?: string[];
    ingressNodeId?: string;
    nodeType?: "dedicated" | "public";
    geo?: string;
  };
  nodeChanged?: boolean;
}

export interface UpdatePlayoutConfigParams {
  objectId: string;
  slug: string;
  status: StreamStatus;
  watermarkParams: {
    textWatermark?: string;
    imageWatermark?: string;
    forensicWatermark?: string;
    existingTextWatermark?: SimpleWatermark;
    existingImageWatermark?: ImageWatermark;
    existingForensicWatermark?: ForensicWatermark;
    watermarkType?: string;
  };
  drmParams: {
    playoutFormats?: PlayoutFormat[];
    existingPlayoutFormats?: PlayoutFormat[];
  };
  configMetaParams: Omit<UpdateConfigMetadataParams,
    "libraryId" | "objectId" | "writeToken" | "finalize" | "slug"
  >;
}

interface AddWatermarkParams {
  objectId: string;
  slug?: string;

  textWatermark?: any;

  imageWatermark?: any;

  forensicWatermark?: any;
  finalize?: boolean;
  writeToken?: string;
}

interface WatermarkConfigurationParams {
  objectId: string;
  slug?: string;
  libraryId?: string;
  textWatermark?: string;
  imageWatermark?: string;
  forensicWatermark?: string;
  existingTextWatermark?: SimpleWatermark;
  existingImageWatermark?: ImageWatermark;
  existingForensicWatermark?: ForensicWatermark;
  watermarkType?: string;
  finalize?: boolean;
  writeToken?: string;
}

interface RemoveWatermarkParams {
  objectId: string;
  slug: string;
  types: ("image" | "text" | "forensic")[];
  writeToken: string;
  finalize?: boolean;
}

interface UpdateRecordingConfigParams {
  libraryId?: string;
  objectId: string;
  slug: string;
  writeToken?: string;
  audioFormData: AudioDataMap;
  configFormData: Pick<UpdateConfigMetadataParams,
    "retention" | "persistent" | "connectionTimeout" | "reconnectionTimeout"
  >;
  tsFormData: Pick<UpdateConfigMetadataParams,
    "copyMpegTs" | "inputPackaging" | "copyPackaging" | "customReadLoop" | "fabricPackagingFMP4" | "fabricPackagingMpegTs" |
    "copyPackagingFormats" | "alternateTranscodeEnabled" | "alternateTranscodes"
  >;
  fmp4FormData?: Pick<UpdateConfigMetadataParams, "programPidSelection" | "advancedEncodingParams">;
  multiPathEnabled?: boolean;
}

interface DrmConfigurationParams {
  libraryId?: string;
  objectId: string;
  slug: string;
  playoutFormats?: PlayoutFormat[];
  existingPlayoutFormats?: PlayoutFormat[];
  writeToken?: string;
  status?: StreamStatus;
  finalize?: boolean;
}

interface UpdateAudioLadderSpecsParams {
  objectId: string;
  libraryId: string;
  writeToken: string;
  ladderSpecs: {audio: Array<Partial<LadderSpec>>};
  audioData?: AudioDataMap;
  edit?: boolean;
}

interface UpdateStreamAudioSettingsParams {
  objectId: string;
  writeToken?: string;
  finalize?: boolean;
  audioData?: AudioDataMap;
  edit?: boolean;
}

class StreamEditStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore | Record<string, unknown>) {
    this.rootStore = rootStore as RootStore;
    makeAutoObservable(this, {}, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  // Stream Lifecycle

  /**
   * Creates a new live stream content object and registers it in the stream store.
   */
  *InitLiveStreamObject({
    objectId,
    accessGroup,
    description,
    displayTitle,
    encryption,
    libraryId,
    name,
    nodeId,
    permission,
    configProfile,
    retention,
    persistent,
    url
  }: InitLiveStreamObjectParams): Generator<any, {objectId: string, slug: string}> {
    try {
      const config = ParseLiveConfigData({
        encryption,
        configProfile,
        retention,
        persistent
      });

      const groupAddress = this.rootStore.tenantStore.accessGroups[accessGroup]?.address;

      const response = yield this.client.StreamCreate({
        libraryId,
        objectId,
        url,
        liveRecordingConfig: config,
        options: {
          accessGroups: groupAddress ? [groupAddress] : undefined,
          displayTitle,
          description,
          ingressNodeId: nodeId,
          linkToSite: true,
          name,
          permission
        }
      });

      const createdObjectId = response.objectId;

      const statusResponse = yield this.rootStore.streamStatusStore.CheckStatus({
        objectId: createdObjectId
      });

      const streamValue = {
        objectId: createdObjectId,
        title: name,
        status: statusResponse.state,
      };

      const streamDetails = yield this.rootStore.streamDetailStore.LoadStreamMetadata({
        objectId: createdObjectId,
        libraryId
      }) || {};

      Object.keys(streamDetails).forEach(detail => {
        streamValue[detail] = streamDetails[detail];
      });

      this.rootStore.streamStatusStore.SetStream({
        key: slugify(name),
        value: streamValue
      });

      return {
        objectId: createdObjectId,
        slug: slugify(name)
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create stream", error);
      throw error;
    }
  }

  *DuplicateStream({
    libraryId,
    originalVersionHash,
    originalSlug,
    name,
    url,
    nodeId
  }: DuplicateStreamParams): Generator<any, FinalizeContentObjectResponse> {
    try {
      const originalStream = this.rootStore.streamStatusStore.streams[originalSlug];
      const targetTitle = name ?? `Copy ${originalStream?.name}`;

      if(!libraryId) {
        // Set target library to same as original object
        libraryId = yield this.client.ContentObjectLibraryId({objectId: originalStream.objectId});
      }

      const response = yield this.client.CopyContentObject({
        libraryId,
        originalVersionHash: originalVersionHash || originalStream?.versionHash,
        options: {
          type: this.rootStore.tenantStore.titleContentType,
          meta: {
            public: {
              name: targetTitle
            }
          }
        }
      });

      const options = {
        linkToSite: true,
        name: targetTitle
      };

      if(nodeId) { options["ingressNodeId"] = nodeId; }

      yield this.client.StreamCreate({
        libraryId,
        objectId: response.id,
        url,
        options
      });


      const statusResponse = yield this.rootStore.streamStatusStore.CheckStatus({
        objectId: response.id
      });

      const streamValue = {
        objectId: response.id,
        title: targetTitle,
        status: statusResponse.state,
      };

      const streamDetails = yield this.rootStore.streamDetailStore.LoadStreamMetadata({
        objectId: response.id,
        libraryId
      }) || {};

      Object.keys(streamDetails).forEach(detail => {
        streamValue[detail] = streamDetails[detail];
      });

      this.rootStore.streamStatusStore.SetStream({
        key: slugify(targetTitle),
        value: streamValue
      });

      return response;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to copy stream", error);
      throw error;
    }
  }

  *DeleteStream({objectId, slug}: {objectId: string, slug?: string}): Generator<any, void> {
    const streams = Object.assign({}, this.rootStore.streamStatusStore.streams);

    if(!slug) {
      slug = Object.keys(streams).find(streamSlug => {
        return streams[streamSlug].objectId === objectId;
      });
    }

    yield this.client.StreamRemoveLinkToSite({objectId, slug});

    try {
      yield this.client.DeleteContentObject({
        libraryId: yield this.client.ContentObjectLibraryId({objectId}),
        objectId
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.log(`Content object ${objectId} has already been deleted. Removed from the site object.`, error);
    }

    delete streams[slug];
    this.rootStore.streamListStore.SetStreams({streams});
  }

  *DeleteStreamBatch({objects}: {objects: StreamRecord[]}): Generator<any, void> {
    const streams = Object.assign({}, this.rootStore.streamStatusStore.streams);

    const resolved = objects.map(object => ({
      objectId: object.objectId,
      slug: object.slug ?? Object.keys(streams).find(slug => streams[slug].objectId === object.objectId)
    }));

    const {writeToken} = yield this.client.EditContentObject({
      libraryId: this.rootStore.tenantStore.siteLibraryId,
      objectId: this.rootStore.tenantStore.siteId
    });

    for(const {objectId, slug} of resolved) {
      yield this.client.StreamRemoveLinkToSite({objectId, slug, writeToken, finalize: false});

      try {
        yield this.client.DeleteContentObject({
          libraryId: yield this.client.ContentObjectLibraryId({objectId}),
          objectId
        });
      } catch(error) {
        // eslint-disable-next-line no-console
        console.log(`Content object ${objectId} has already been deleted. Removed from the site object.`, error);
      }

      delete streams[slug];
    }

    yield this.client.FinalizeContentObject({
      libraryId: this.rootStore.tenantStore.siteLibraryId,
      objectId: this.rootStore.tenantStore.siteId,
      writeToken,
      commitMessage: "Remove live streams",
      awaitCommitConfirmation: true
    });

    this.rootStore.streamListStore.SetStreams({streams});
  }

  // Permissions & Access

  *SetPermission({objectId, permission}: {objectId: string, permission: PermissionLevel}): Generator<any, void> {
    try {
      const response = yield this.client.SetPermission({
        objectId,
        permission
      });

      yield new Promise(resolve => setTimeout(resolve, 1000));

      return response;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to set permission.", error);
    }
  }

  *AddAccessGroupPermission({
    objectId,
    groupName,
    groupAddress
  }: {objectId: string, groupName?: string, groupAddress?: string}): Generator<any, void> {
    try {
      if(!groupAddress) {
        groupAddress = this.rootStore.tenantStore.accessGroups[groupName]?.address;
      }

      yield this.client.AddContentObjectGroupPermission({
        objectId,
        groupAddress,
        permission: "manage"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to add group permission for group: ${groupName || groupAddress}`, error);
    }
  }

  RemoveAccessGroupPermission = ({
    objectId,
    groupAddress
  }: {objectId: string, groupAddress: string}): Generator<any, void> => {
    try {
      return this.client.RemoveContentObjectGroupPermission({
        objectId,
        groupAddress,
        permission: "manage"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to remove group permission for group: ${groupAddress}`, error);
    }
  };

  *SaveAccessGroupPermission({objectId, addGroup, removeGroup}: {objectId: string, addGroup: string, removeGroup: string}): Generator<any, void> {
    if(removeGroup) {
      yield this.RemoveAccessGroupPermission({
        objectId,
        groupAddress: removeGroup
      });
    }

    if(addGroup) {
      yield this.AddAccessGroupPermission({
        objectId,
        groupAddress: addGroup
      });
    }
  }

  // Metadata Writes

  *SaveDetailMetadata({
    libraryId,
    objectId,
    writeToken,
    finalize=true,
    name,
    url,
    description,
    displayTitle,
    slug,
    tags
  }: UpdateDetailMetadataParams): Generator<any, FinalizeContentObjectResponse> {
    try {
      const updateValue = {};

      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      if(!writeToken) {
        ({writeToken} = yield this.client.EditContentObject({
          libraryId,
          objectId
        }));
      }

      const metadata = {
        public: {
          asset_metadata: {}
        }
      };

      if(name) {
        metadata.public["name"] = name;
        metadata.public.asset_metadata["title"] = name;
        updateValue["title"] = name;
      }

      if(url) {
        yield this.client.ReplaceMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/origin_url",
          metadata: url
        });

        yield this.client.MergeMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording_config",
          metadata: {
            reference_url: url,
            url
          }
        });
      }

      if(description) {
        metadata.public["description"] = description;
      }

      if(displayTitle) {
        metadata.public.asset_metadata["display_title"] = displayTitle;
      }

      yield this.client.MergeMetadata({
        libraryId,
        objectId,
        writeToken,
        metadata
      });

      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "public/asset_metadata/tags",
        metadata: tags ?? []
      });

      let response: FinalizeContentObjectResponse;
      if(finalize) {
        response = this.client.FinalizeContentObject({
          libraryId,
          objectId,
          writeToken,
          commitMessage: "Update metadata",
          awaitCommitConfirmation: true
        });
      }

      this.rootStore.streamStatusStore.SetStream({
        key: slug,
        value: updateValue
      });

      return response;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update metadata", error);
    }
  }

  *SaveConfigMetadata({
    libraryId,
    objectId,
    writeToken,
    finalize=true,
    slug,
    retention,
    persistent,
    connectionTimeout,
    reconnectionTimeout,
    skipDvrSection=false,
    dvrEnabled,
    dvrStartTime,
    dvrMaxDuration,
    copyMpegTs,
    fabricPackagingFMP4,
    fabricPackagingMpegTs,
    inputPackaging,
    copyPackaging,
    copyPackagingFormats,
    alternateTranscodeEnabled,
    alternateTranscodes,
    resolution,
    videoBitrate,
    streamBitrate,
    programPidSelection,
    advancedEncodingParams,
    audioData,
    multiPathEnabled
  }: UpdateConfigMetadataParams) : Generator<any, {writeToken: string}> {
    ({writeToken} = yield WithWriteToken(
      {client: this.client, objectId, libraryId, writeToken, finalize, commitMessage: "Update recording config"},
      async ({libraryId, objectId, writeToken}) => {
        const existingConfig = await this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording_config"
        });

        const recordingConfig = {...existingConfig?.recording_config};
        if(retention !== undefined) recordingConfig.part_ttl = parseInt(retention);
        if(persistent !== undefined) recordingConfig.persistent = persistent;
        if(connectionTimeout !== undefined) recordingConfig.connection_timeout = parseInt(connectionTimeout);
        if(reconnectionTimeout !== undefined) recordingConfig.reconnect_timeout = parseInt(reconnectionTimeout);
        if(copyMpegTs !== undefined) {
          recordingConfig.copy_mpegts = copyMpegTs;
          recordingConfig.input_cfg = copyMpegTs ? {
            bypass_libav_reader: true,
            copy_mode: DeriveCopyMode({fabricPackagingFMP4, fabricPackagingMpegTs}),
            copy_packaging: DeriveCopyPackaging({fabricPackagingMpegTs, copyPackaging}),
            input_packaging: inputPackaging,
            custom_read_loop_enabled: true
          } : {};
        }

        // New fields, additive to the legacy input_cfg above - see the comment
        // on UpdateConfigMetadataParams for the pending-confirmation caveat.
        if(copyPackagingFormats !== undefined) recordingConfig.copy_packaging_formats = copyPackagingFormats;
        if(alternateTranscodeEnabled !== undefined) recordingConfig.alternate_transcode_enabled = alternateTranscodeEnabled;
        if(programPidSelection !== undefined) recordingConfig.program_pid_selection = programPidSelection;

        const recordingStreamConfig = {...existingConfig?.recording_stream_config};
        if(audioData !== undefined) {
          recordingStreamConfig.audio = audioData;
        }

        const playoutConfig = {...existingConfig?.playout_config};
        if(!skipDvrSection && dvrEnabled !== undefined) {
          playoutConfig.dvr = dvrEnabled;
          if(dvrEnabled) {
            if(dvrStartTime) {
              playoutConfig.dvr_start_time = new Date(dvrStartTime).toISOString();
            } else {
              delete playoutConfig.dvr_start_time;
            }
            if(dvrMaxDuration != null) { playoutConfig.dvr_max_duration = parseInt(dvrMaxDuration); }
          } else {
            delete playoutConfig.dvr_start_time;
            delete playoutConfig.dvr_max_duration;
          }
        }

        const liveRecordingConfigUpdate: Record<string, any> = {
          ...existingConfig,
          recording_config: recordingConfig,
          playout_config: playoutConfig,
          recording_stream_config: recordingStreamConfig
        };
        if(advancedEncodingParams && Object.keys(advancedEncodingParams).length > 0) {
          liveRecordingConfigUpdate.recording_params = {
            ...existingConfig?.recording_params,
            xc_params: advancedEncodingParams
          };
        }
        // Sibling of recording_config on live_recording_config - see AlternateTranscodeStore.CreateAlternateTranscode.
        if(alternateTranscodes !== undefined) liveRecordingConfigUpdate.alternate_transcodes = alternateTranscodes;

        await this.client.ReplaceMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording_config",
          metadata: liveRecordingConfigUpdate
        });

        if(retention !== undefined) {
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/part_ttl",
            metadata: parseInt(retention)
          });
        }

        if(persistent !== undefined) {
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/persistent",
            metadata: persistent
          });
        }

        if(connectionTimeout !== undefined) {
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params/connection_timeout",
            metadata: parseInt(connectionTimeout)
          });
        }

        if(reconnectionTimeout !== undefined) {
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/reconnect_timeout",
            metadata: parseInt(reconnectionTimeout)
          });
        }

        if(copyMpegTs !== undefined) {
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params/copy_mpegts",
            metadata: copyMpegTs
          });
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params/input_cfg",
            metadata: copyMpegTs ? {
              bypass_libav_reader: true,
              copy_mode: DeriveCopyMode({fabricPackagingFMP4, fabricPackagingMpegTs}),
              copy_packaging: DeriveCopyPackaging({fabricPackagingMpegTs, copyPackaging}),
              custom_read_loop_enabled: true,
              input_packaging: inputPackaging
            } : {}
          });
        }

        // xc_params fields for the applied live_recording tree (unlike
        // recording_config above). streamBitrate is written as a leaf under
        // input_cfg - note the copyMpegTs block above replaces all of input_cfg
        // wholesale, so passing both together would wipe this (not currently
        // possible: alternate transcode callers never pass copyMpegTs).
        if(videoBitrate !== undefined) {
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params/video_bitrate",
            metadata: ParseBitrate(videoBitrate, "video bitrate")
          });
        }

        if(streamBitrate !== undefined) {
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params/input_cfg/stream_bitrate",
            metadata: ParseBitrate(streamBitrate, "stream bitrate")
          });
        }

        if(resolution !== undefined) {
          const dimensions = RESOLUTION_DIMENSIONS[resolution] ?? null;
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params/enc_height",
            metadata: dimensions?.height ?? null
          });
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params/enc_width",
            metadata: dimensions?.width ?? null
          });
        }

        if(multiPathEnabled !== undefined) {
          let multiPathMeta: {enabled: boolean; stream_names?: string[]} = {enabled: false};
          if(multiPathEnabled) {
            const streamNames = [
              "video",
              ...Object.keys(audioData || {})
                .filter(key => audioData[key].record)
                .map((el) => `audio_${el}`)
            ];
            if(copyMpegTs) { streamNames.push("mpegts"); }
            multiPathMeta = {enabled: true, stream_names: streamNames};
          }
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/fabric_config/multipath",
            metadata: multiPathMeta
          });
        }

        if(!skipDvrSection && dvrEnabled !== undefined) {
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording/playout_config/dvr_enabled",
            metadata: dvrEnabled
          });
          await this.client.ReplaceMetadata({
            libraryId, objectId, writeToken,
            metadataSubtree: "live_recording_overrides/playout_config/dvr_enabled",
            metadata: dvrEnabled
          });
          if(dvrEnabled) {
            if(dvrStartTime) {
              await this.client.ReplaceMetadata({
                libraryId, objectId, writeToken,
                metadataSubtree: "live_recording/playout_config/dvr_start_time",
                metadata: new Date(dvrStartTime).toISOString()
              });
              await this.client.ReplaceMetadata({
                libraryId, objectId, writeToken,
                metadataSubtree: "live_recording_overrides/playout_config/dvr_start_time",
                metadata: new Date(dvrStartTime).toISOString()
              });
            } else {
              await this.client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording/playout_config/dvr_start_time"});
              await this.client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording_overrides/playout_config/dvr_start_time"});
            }
            if(dvrMaxDuration != null) {
              await this.client.ReplaceMetadata({
                libraryId, objectId, writeToken,
                metadataSubtree: "live_recording/playout_config/dvr_max_duration",
                metadata: parseInt(dvrMaxDuration)
              });
              await this.client.ReplaceMetadata({
                libraryId, objectId, writeToken,
                metadataSubtree: "live_recording_overrides/playout_config/dvr_max_duration",
                metadata: parseInt(dvrMaxDuration)
              });
            }
          } else {
            await this.client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording/playout_config/dvr_start_time"});
            await this.client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording/playout_config/dvr_max_duration"});
            await this.client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording_overrides/playout_config/dvr_start_time"});
            await this.client.DeleteMetadata({libraryId, objectId, writeToken, metadataSubtree: "live_recording_overrides/playout_config/dvr_max_duration"});
          }
        }
      }
    ));

    this.rootStore.streamStatusStore.SetStream({
      key: slug,
      value: {
        connectionTimeout: connectionTimeout !== undefined ? parseInt(connectionTimeout) : undefined,
        dvrEnabled,
        dvrMaxDuration: dvrMaxDuration != null ? dvrMaxDuration : undefined,
        dvrStartTime: dvrStartTime ? new Date(dvrStartTime).toISOString() : undefined,
        partTtl: retention !== undefined ? parseInt(retention) : undefined,
        reconnectionTimeout: reconnectionTimeout !== undefined ? parseInt(reconnectionTimeout) : undefined
      }
    });

    return {
      writeToken
    };
  }

  *SaveRecordingConfig({
    libraryId,
    objectId,
    slug,
    writeToken,
    audioFormData,
    configFormData,
    tsFormData,
    fmp4FormData,
    multiPathEnabled
  }: UpdateRecordingConfigParams): Generator<any, void> {
    yield WithWriteToken(
      {client: this.client, objectId, libraryId, writeToken, commitMessage: "Update recording config"},
      async ({objectId, writeToken}) => {
        const {retention, persistent, connectionTimeout, reconnectionTimeout} = configFormData;
        const {
          copyMpegTs, inputPackaging, copyPackaging, fabricPackagingFMP4, fabricPackagingMpegTs,
          copyPackagingFormats, alternateTranscodeEnabled, alternateTranscodes
        } = tsFormData;
        const {programPidSelection, advancedEncodingParams} = fmp4FormData ?? {};

        if(fabricPackagingFMP4 === true || !copyMpegTs) {
          await this.SaveStreamAudioSettings({
            objectId,
            writeToken,
            audioData: audioFormData,
            finalize: false,
            edit: true
          });
        }

        await this.SaveConfigMetadata({
          objectId,
          slug,
          retention,
          persistent,
          connectionTimeout,
          reconnectionTimeout,
          copyMpegTs,
          fabricPackagingFMP4,
          fabricPackagingMpegTs,
          inputPackaging,
          copyPackaging,
          copyPackagingFormats,
          alternateTranscodeEnabled,
          alternateTranscodes,
          programPidSelection,
          advancedEncodingParams,
          audioData: audioFormData,
          multiPathEnabled,
          writeToken,
          finalize: false
        });
      }
    );
  }

  *SaveGeneralConfig({
    objectId,
    libraryId,
    formData,
    writeToken,
    slug,
    configProfile,
    nodeChanged=false,
    updatePermission=false,
    updateAccessGroup=false,
    removeAccessGroup
  }: UpdateGeneralConfigParams): Generator<any, void> {
    const {accessGroup, name, url, description, displayTitle, permission, tags, ingressNodeId, nodeType, geo} = formData;

    if(!libraryId) {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    const existingConfig = yield this.client.ContentObjectMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config",
      select: ["probe_info"]
    });

    const publicNode = nodeType === "public";
    const resolvedNodeId = !nodeChanged ? undefined :
      publicNode ? yield ResolveIngestNodeId({client: this.client, geo: geo || undefined}) : (ingressNodeId || undefined);

    const existingUrl = url ? yield this.client.ContentObjectMetadata({
      libraryId,
      objectId,
      writeToken,
      metadataSubtree: "live_recording_config/url"
    }) : undefined;

    yield this.SaveDetailMetadata({
      objectId,
      name,
      url,
      description,
      displayTitle,
      tags,
      slug,
      writeToken,
      finalize: false
    });

    const hostOf = (value?: string) => value?.replace(/^[a-z]+:\/\//, "").match(/^[^/:]+/)?.[0];
    const host = hostOf(url);
    if(nodeChanged) {
      yield this.client.MergeMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config",
        metadata: {
          ingress_node_id: resolvedNodeId ?? null,
          geo: publicNode ? (geo || null) : null
        }
      });

      // Re-derive fabric_config for the new node so start/stop target it;
      // needs existing probe data since StreamConfig would otherwise re-probe.
      if(!configProfile && resolvedNodeId && existingConfig?.probe_info) {
        yield this.client.StreamConfig({
          name: objectId,
          writeToken,
          finalize: false,
          inputStreamInfo: existingConfig.probe_info
        });
      }
    } else if(!configProfile && host && host !== hostOf(existingUrl)) {
      const hasFabricConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording/fabric_config/ingress_node_id"
      });

      if(hasFabricConfig) {
        const nodes = yield this.client.SpaceNodes({matchEndpoint: host});

        // Host isn't a fabric node (e.g. multicast or an external encoder)
        if(nodes?.length) {
          yield this.client.MergeMetadata({
            libraryId,
            objectId,
            writeToken,
            metadataSubtree: "live_recording/fabric_config",
            metadata: {
              ingress_node_api: nodes[0].services.fabric_api.urls[0],
              ingress_node_id: nodes[0].id
            }
          });
        }
      }
    }

    if(configProfile) {
      const {siteWriteToken} = yield this.ApplyStreamProfile({
        objectId,
        writeToken,
        profileSlug: configProfile,
        finalize: false
      });

      if(siteWriteToken) {
        yield this.client.FinalizeContentObject({
          libraryId: this.rootStore.tenantStore.siteLibraryId,
          objectId: this.rootStore.tenantStore.siteId,
          writeToken: siteWriteToken,
          commitMessage: "Update profile streams"
        });
      }
    }

    if(updatePermission) {
      yield this.SetPermission({
        objectId,
        permission
      });
    }

    if(updateAccessGroup) {
      yield this.SaveAccessGroupPermission({
        objectId,
        addGroup: accessGroup,
        removeGroup: removeAccessGroup
      });
    }

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Apply general config"
    });

    this.rootStore.streamStatusStore.SetStream({
      key: slug,
      value: {
        tags: tags ?? [],
        ...(configProfile ? {configProfile} : {}),
        ...(nodeChanged ? {ingressNodeId: resolvedNodeId ?? "", geo: publicNode ? (geo || "") : ""} : {})
      }
    });
  }

  *SavePlayoutConfig({
    objectId,
    slug,
    status,
    watermarkParams,
    drmParams,
    configMetaParams
  }: UpdatePlayoutConfigParams): Generator<any, void> {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});
    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId
    });

    const basicCallParams = {
      libraryId,
      objectId,
      writeToken,
      slug,
      finalize: false
    };

    yield this.SaveWatermarkConfiguration({
      ...basicCallParams,
      ...watermarkParams
    });

    yield this.SaveDrmConfiguration({
      ...basicCallParams,
      ...drmParams,
      status
    });

    yield this.SaveConfigMetadata({
      ...basicCallParams,
      ...configMetaParams,
      skipDvrSection: !([STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED] as StreamStatus[]).includes(status)
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage: "Apply playout settings"
    });

    const statusResponse = yield this.rootStore.streamStatusStore.CheckStatus({
      objectId
    });

    this.rootStore.streamStatusStore.SetStream({
      key: slug,
      value: {
        status: statusResponse.state
      }
    });
  }

  *ApplyStreamProfile({
    objectId,
    writeToken,
    profileSlug,
    finalize=true
  }: {objectId: string, writeToken?: string, profileSlug: string, finalize?: boolean}) : Generator<any, {streamWriteToken?: string, siteWriteToken?: string, config?: LiveRecordingConfigProfile}> {
    const profile = this.rootStore.profileStore.profiles[profileSlug];

    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      }));
    }

    const response = yield this.client.StreamApplyProfile({
      profile: toJS(profile),
      objectId,
      streamWriteToken: writeToken,
      finalize: false
    });

    if(!response?.probeCleared) {
      yield this.SaveStreamAudioSettings({
        objectId,
        writeToken,
        finalize: false
      });
    }

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Apply stream profile",
        awaitCommitConfirmation: true
      });

      if(response?.siteWriteToken) {
        yield this.client.FinalizeContentObject({
          libraryId: this.rootStore.tenantStore.siteLibraryId,
          objectId: this.rootStore.tenantStore.siteId,
          writeToken: response.siteWriteToken,
          commitMessage: "Apply stream profile",
          awaitCommitConfirmation: true
        });
      }
    }

    return response;
  }

  // Stream Configuration (probe, watermark, DRM, audio)

  *ConfigureStream({
    objectId,
    slug,
    probeMetadata,
    syncAudioToProbe=true
  }: {objectId: string, slug: string, probeMetadata?: ProbeData, syncAudioToProbe?: boolean}): Generator<any, void> {
    try {
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});

      const liveRecordingConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config"
      });

      const {writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId
      });

      delete liveRecordingConfig.input_stream_info;
      delete liveRecordingConfig.probe_info;

      yield this.client.StreamConfig({
        name: objectId,
        writeToken,
        finalize: false,
        liveRecordingConfig,
        probeMetadata,
        // Probing the input can take longer than the default FrameClient timeout
        fcTimeout: 900
      });

      if(syncAudioToProbe) {
        yield this.SyncAudioToProbe({
          libraryId,
          objectId,
          writeToken,
          finalize: false
        });
      }

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Apply live stream configuration"
      });

      yield this.rootStore.settingsStore.SaveStreamLink({objectId, slug});

      const response = yield this.rootStore.streamStatusStore.CheckStatus({
        objectId
      });

      const streamDetails = yield this.rootStore.streamDetailStore.LoadStreamMetadata({
        objectId
      });

      this.rootStore.streamStatusStore.SetStream({
        key: slug,
        value: {
          status: response.state,
          warnings: response.warnings,
          quality: response.quality,
          ...streamDetails
        }
      });
    } catch(error) {
      const isTimeout = typeof error === "string" && error.includes("timed out");

      // eslint-disable-next-line no-console
      console.error(isTimeout ? "Stream configuration request timed out" : "Unable to configure stream", error);

      throw error;
    }
  }

  *RemoveWatermark({
    objectId,
    slug,
    types,
    writeToken,
    finalize
  }: RemoveWatermarkParams): Generator<any, void> {
    yield this.client.StreamRemoveWatermark({
      objectId,
      types,
      writeToken,
      finalize
    });

    const updateValue: {imageWatermark?: undefined, simpleWatermark?: undefined, forensicWatermark?: undefined} = {};

    types.forEach(type => {
      if(type === "image") {
        updateValue.imageWatermark = undefined;
      } else if(type === "text") {
        updateValue.simpleWatermark = undefined;
      } else if(type === "forensic") {
        updateValue.forensicWatermark = undefined;
      }
    });

    this.rootStore.streamStatusStore.SetStream({
      key: slug,
      value: updateValue
    });
  }

  *AddWatermark({
    objectId,
    slug,
    textWatermark,
    imageWatermark,
    forensicWatermark,
    finalize=true,
    writeToken
  }: AddWatermarkParams): Generator<any, void> {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({objectId, libraryId}));
    }

    const payload = {
      objectId,
      writeToken,
      finalize: false
    };

    if(imageWatermark) {
      payload["imageWatermark"] = imageWatermark;
    } else if(textWatermark) {
      payload["simpleWatermark"] = textWatermark;
    } else if(forensicWatermark) {
      payload["forensicWatermark"] = forensicWatermark;
    }

    const response = yield this.client.StreamAddWatermark(payload);

    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Set watermark"
      });
    }

    if(response) {
      this.rootStore.streamStatusStore.SetStream({
        key: slug,
        value: {
          imageWatermark: response.imageWatermark,
          simpleWatermark: response.textWatermark,
          forensicWatermark: response.forensicWatermark
        }
      });
    }
  }

  *SaveWatermarkConfiguration({
    textWatermark,
    imageWatermark,
    forensicWatermark,
    existingTextWatermark,
    existingImageWatermark,
    existingForensicWatermark,
    watermarkType,
    libraryId,
    objectId,
    slug,
    writeToken,
    finalize=true
  }: WatermarkConfigurationParams) : Generator<any, void> {
    const removeTypes = [];
    const payload = {
      objectId,
      slug
    };

    if(existingTextWatermark && !textWatermark) {
      removeTypes.push("text");
    } else if(textWatermark) {
      payload["textWatermark"] = textWatermark ? JSON.parse(textWatermark) : null;
    }

    if(existingImageWatermark && !imageWatermark) {
      removeTypes.push("image");
    } else if(imageWatermark) {
      payload["imageWatermark"] = imageWatermark ? JSON.parse(imageWatermark) : null;
    }

    if(existingForensicWatermark && !forensicWatermark) {
      removeTypes.push("forensic");
    } else if(forensicWatermark) {
      payload["forensicWatermark"] = forensicWatermark ? JSON.parse(forensicWatermark) : null;
    }

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({objectId, libraryId}));
    }

    if(imageWatermark || textWatermark || forensicWatermark) {
      yield this.AddWatermark({...payload,
        writeToken,
        finalize: false
      });

      if(imageWatermark) {
        yield this.client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording_overrides/playout_config/image_watermark",
          metadata: JSON.parse(imageWatermark)
        });
      } else if(textWatermark) {
        yield this.client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording_overrides/playout_config/simple_watermark",
          metadata: JSON.parse(textWatermark)
        });
      } else if(forensicWatermark) {
        yield this.client.ReplaceMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: "live_recording_overrides/playout_config/forensic_watermark",
          metadata: JSON.parse(forensicWatermark)
        });
      }
    }

    if(removeTypes.length > 0) {
      yield this.RemoveWatermark({
        objectId,
        slug,
        writeToken,
        finalize: false,
        types: removeTypes
      });

      for(const type of removeTypes) {
        const subtree = type === "image" ? "image_watermark" : type === "text" ? "simple_watermark" : "forensic_watermark";
        yield this.client.DeleteMetadata({
          libraryId, objectId, writeToken,
          metadataSubtree: `live_recording_overrides/playout_config/${subtree}`
        });
      }
    }

    let updateValue = {};
    if(finalize) {
      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Configure watermark"
      });

      const statusResponse = yield this.rootStore.streamStatusStore.CheckStatus({
        objectId
      });

      updateValue["status"] = statusResponse.state;
    } else {
      updateValue["watermarkType"] = watermarkType;
    }

    this.rootStore.streamStatusStore.SetStream({
      key: slug,
      value: updateValue
    });
  }

  *SaveDrmConfiguration({
    libraryId,
    objectId,
    slug,
    playoutFormats,
    existingPlayoutFormats,
    writeToken,
    status,
    finalize=true
  }: DrmConfigurationParams): Generator<any, {drmNeedsInit: boolean, drmInitPayload: {name: string, drm: boolean, format: string}} | void> {
    if(existingPlayoutFormats === playoutFormats) { return; }

    libraryId = yield this.client.ContentObjectLibraryId({objectId});

    if(!writeToken) {
      ({writeToken} = yield this.client.EditContentObject({
        objectId,
        libraryId
      }));
    }

    yield this.client.ReplaceMetadata({
      objectId,
      libraryId,
      writeToken,
      metadataSubtree: "live_recording/playout_config/playout_formats",
      metadata: playoutFormats
    });

    yield this.client.ReplaceMetadata({
      objectId,
      libraryId,
      writeToken,
      metadataSubtree: "live_recording_overrides/playout_config/playout_formats",
      metadata: playoutFormats
    });

    let updateValue = {}, drmNeedsInit = false;

    if(!([STATUS_MAP.UNINITIALIZED, STATUS_MAP.UNCONFIGURED] as StreamStatus[]).includes(status)) {
      yield this.client.StreamInitialize({
        name: objectId,
        drm: !!playoutFormats.some(format => !format.includes("clear")),
        format: playoutFormats.join(","),
        writeToken,
        finalize: false
      });
    }

    if(finalize) {
      yield this.client.FinalizeContentObject({
        objectId,
        libraryId,
        writeToken,
        commitMessage: "Update drm type metadata"
      });

      const statusResponse = yield this.rootStore.streamStatusStore.CheckStatus({
        objectId
      });

      updateValue["status"] = statusResponse.state;
    } else {
      updateValue["drm"] = playoutFormats;
      drmNeedsInit = true;
    }

    this.rootStore.streamStatusStore.SetStream({
      key: slug,
      value: updateValue
    });

    return {
      drmNeedsInit,
      drmInitPayload: {
        name: objectId,
        drm: !!playoutFormats.some(format => !format.includes("clear")),
        format: playoutFormats.join(",")
      }
    };
  }

  CreateAudioStreamsConfig = ({audioData={}}: {audioData?: AudioDataMap | {}}): Record<string, {playoutLabel: string, recordingBitrate: number, recordingChannels: number}> => {
    let audioStreams = {};

    for(let i = 0; i < Object.keys(audioData || {}).length; i++) {
      const audioIndex = Object.keys(audioData || {})[i];
      const audio = audioData[audioIndex];

      audioStreams[audioIndex] = {
        recordingBitrate: audio.recording_bitrate || 192000,
        recordingChannels: audio.recording_channels || 2
      };

      if(audio.playout) {
        audioStreams[audioIndex].playoutLabel = audio.playout_label || `Audio ${audioIndex}`;
      }
    }

    return audioStreams;
  };

  *SaveAudioLadderSpecs({
    objectId,
    libraryId,
    writeToken,
    ladderSpecs,
    audioData,
    edit=false
  }: UpdateAudioLadderSpecsParams): Generator<any, {nAudio: number, globalAudioBitrate: number, audioLadderSpecs: LadderSpec[], audioIndexMeta: number[]}> {
    let globalAudioBitrate = 0;
    let nAudio = 0;
    const audioLadderSpecs = [];

    if(!audioData) {
      audioData = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config/recording_stream_config/audio"
      });
    }

    const audioIndexMeta = [0, 0, 0, 0, 0, 0, 0, 0];

    const audioStreams = this.CreateAudioStreamsConfig({audioData});
    Object.keys(audioStreams || {}).forEach((stream, i) => {
      let audioLadderSpec: Partial<LadderSpec> = {};
      const audioIndex = Object.keys(audioStreams)[i];
      const audio = audioStreams[audioIndex];

      if(!audioData[audioIndex].record) { return; }

      audioIndexMeta[nAudio] = parseInt(audioIndex);

      for(let j = 0; j < (ladderSpecs.audio || []).length; j++) {
        let element = ladderSpecs.audio[j];
        if(element.channels === audio.recordingChannels) {
          audioLadderSpec = {...element};
          break;
        }
      }

      if(Object.keys(audioLadderSpec).length === 0) {
        audioLadderSpec = {...(ladderSpecs.audio || [])[0]};
      }

      audioLadderSpec.representation = `audioaudio_aac@${audioLadderSpec.bit_rate}`;
      audioLadderSpec.channels = audio.recordingChannels;
      audioLadderSpec.stream_index = parseInt(audioIndex);
      audioLadderSpec.stream_name = `audio_${audioIndex}`;
      audioLadderSpec.stream_label = audioData[audioIndex].playout ? audioData[audioIndex].playout_label : null;
      audioLadderSpec.media_type = 2;
      audioLadderSpec.lang = audioData[audioIndex].lang;

      if(Object.keys(audioStreams).length === 1 && !edit) {
        audioLadderSpec.default = true;
      } else {
        audioLadderSpec.default = audioData[audioIndex].default;
      }

      audioLadderSpecs.push(audioLadderSpec);

      if(audio.recordingBitrate > globalAudioBitrate) {
        globalAudioBitrate = audio.recordingBitrate;
      }

      nAudio++;
    });

    return {
      nAudio,
      globalAudioBitrate,
      audioLadderSpecs,
      audioIndexMeta
    };
  }

  *SaveStreamAudioSettings({
    objectId,
    writeToken,
    finalize=true,
    audioData,
    edit=false
  }: UpdateStreamAudioSettingsParams): Generator<any, void> {
    yield WithWriteToken(
      {client: this.client, objectId, writeToken, finalize, commitMessage: "Update audio settings"},
      async ({libraryId, objectId, writeToken}) => {
        if(!audioData) {
          audioData = await this.client.ContentObjectMetadata({
            libraryId,
            objectId,
            writeToken,
            metadataSubtree: "live_recording_config/recording_stream_config/audio"
          });
        }

        if(!audioData || Object.keys(audioData).length === 0) {
          // No recording_stream_config/audio — derive audio_index from whatever StreamConfig wrote to ladder_specs.
          const currentLadderSpecs = await this.client.ContentObjectMetadata({
            libraryId,
            objectId,
            writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/ladder_specs"
          });

          const audioEntries = (currentLadderSpecs || []).filter(spec =>
            spec.media_type === 2 || (spec.stream_name || "").includes("audio")
          );

          const audioIndex = [0, 0, 0, 0, 0, 0, 0, 0];
          audioEntries.forEach((entry, i) => {
            audioIndex[i] = entry.stream_index ?? 0;
          });

          const xcParams = await this.client.ContentObjectMetadata({
            libraryId,
            objectId,
            writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params"
          });

          await this.client.ReplaceMetadata({
            libraryId,
            objectId,
            writeToken,
            metadataSubtree: "live_recording/recording_config/recording_params/xc_params",
            metadata: {
              ...(xcParams || {}),
              n_audio: audioEntries.length,
              audio_index: audioIndex
            }
          });

          return;
        }

        const audioKeys = Object.keys(audioData || {});
        if(audioKeys.length === 1) {
          audioData = {...audioData, [audioKeys[0]]: {...audioData[audioKeys[0]], default: true}};
        }

        await this.client.ReplaceMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording_config/recording_stream_config/audio",
          metadata: audioData
        });

        const ladderSpecsPath = "live_recording/recording_config/recording_params/ladder_specs";
        const ladderSpecsMeta = await this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: ladderSpecsPath
        });

        const filteredAudioData = {...audioData};

        Object.keys(filteredAudioData || {}).forEach(index => {
          if(!filteredAudioData[index].record) {
            delete filteredAudioData[index];
          }
        });

        const {nAudio, globalAudioBitrate, audioLadderSpecs, audioIndexMeta} = await (this.SaveAudioLadderSpecs({
          libraryId,
          objectId,
          writeToken,
          ladderSpecs: {audio: ladderSpecsMeta},
          audioData: filteredAudioData,
          edit
        }) as unknown as Promise<{nAudio: number, globalAudioBitrate: number, audioLadderSpecs: LadderSpec[], audioIndexMeta: number[]}>);

        const videoLadderSpecs = (ladderSpecsMeta || []).filter(spec => spec.stream_name.includes("video"));

        const newLadderSpecs = [
          ...videoLadderSpecs,
          ...audioLadderSpecs
        ];

        await this.client.ReplaceMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: ladderSpecsPath,
          metadata: newLadderSpecs
        });

        const xcParams = await this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params"
        });

        await this.client.ReplaceMetadata({
          libraryId,
          objectId,
          writeToken,
          metadataSubtree: "live_recording/recording_config/recording_params/xc_params",
          metadata: {
            ...(xcParams || {}),
            audio_bitrate: globalAudioBitrate,
            n_audio: nAudio,
            audio_index: audioIndexMeta
          }
        });
      }
    );
  }

  *SyncAudioToProbe({libraryId, objectId, writeToken, finalize=true}: {libraryId?: string, objectId: string, writeToken?: string, finalize?: boolean}): Generator<any, void> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const liveRecordingMetadata = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "live_recording_config",
        select: [
          "probe_info/streams",
          "recording_stream_config/audio"
        ]
      });

      const audioConfig = liveRecordingMetadata?.recording_stream_config?.audio || {};
      const probeAudioStreams = (liveRecordingMetadata?.probe_info?.streams || [])
        .filter(stream => stream.codec_type === "audio");
      const audioIndexes = probeAudioStreams.map(stream => stream.stream_index);

      probeAudioStreams.forEach((stream, i) => {
        const currentAudioSetting = audioConfig[stream.stream_index];

        if(currentAudioSetting) {
          currentAudioSetting.bitrate = stream.bit_rate;
          currentAudioSetting.codec = stream.codec_name;
          currentAudioSetting.recording_channels = stream.channels;

          if(probeAudioStreams.length === 1) {
            currentAudioSetting.record = true;
          }
        } else {
          audioConfig[stream.stream_index] = {
            bitrate: stream.bit_rate,
            codec: stream.codec_name,
            playout: true,
            playout_label: `Audio ${i + 1}`,
            record: true,
            recording_bitrate: 192000,
            recording_channels: stream.channels
          };
        }

        const audioToDelete = [];
        Object.keys(audioConfig || {}).forEach(index => {
          if(!audioIndexes.includes(parseInt(index))) {
            audioToDelete.push(index);
          }
        });

        audioToDelete.forEach(index => delete audioConfig[index]);
      });

      yield this.SaveStreamAudioSettings({
        objectId,
        audioData: audioConfig,
        writeToken,
        finalize
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to sync audio settings to probe data", error);
    }
  }

  // VOD

  *SaveStreamTags({objectId, slug, tags}: {objectId: string, slug: string, tags: string[]}): Generator<any, void> {
    try {
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});
      const {writeToken} = yield this.client.EditContentObject({libraryId, objectId});

      yield this.client.ReplaceMetadata({
        libraryId,
        objectId,
        writeToken,
        metadataSubtree: "public/asset_metadata/tags",
        metadata: tags
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Update tags",
        awaitCommitConfirmation: true
      });

      this.rootStore.streamListStore.SetStreamTags({slug, tags});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update stream tags.", error);
      throw error;
    }
  }

  *SaveStreamTagsBatch({streams}: {streams: {objectId: string, slug: string, tags: string[]}[]}): Generator<any, void> {
    try {
      yield Promise.all(
        streams.map(stream => this.SaveStreamTags(stream))
      );

      const listStore = this.rootStore.streamListStore;
      const staleFilter = listStore.tableTagFilter.filter(tag =>
        !listStore.IsNameTag(tag) && !Object.values(this.rootStore.streamStatusStore.streams).some(s => s.tags?.includes(tag))
      );

      if(staleFilter.length > 0) {
        listStore.SetTableTagFilter(listStore.tableTagFilter.filter(t => !staleFilter.includes(t)));
        yield listStore.LoadStreamList({reload: true});
      }
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update stream tags (batch).", error);
      throw error;
    }
  }
}

export default StreamEditStore;
