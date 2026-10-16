// Per-stream detail reads for the stream details page (summary, general, recording, playout, probe) and playout URL building.
import {makeAutoObservable} from "mobx";
import {slugify} from "@/utils/helpers";
import {ALTERNATE_TRANSCODE_PROTOCOLS, RECORDING_BITRATE_OPTIONS} from "@/utils/constants";
import {
  AlternateTranscode,
  DeriveSourceAndPackaging,
  ProgramPidSelection,
  ProbeProgram,
  RawProbeProgram,
  ProgramsFromProbe,
  StreamMetadata, ProbeStream, RecordingInputCfg
} from "@/utils/stream/stream";
import type RootStore from "@/stores/RootStore";
import {ALL_DRMS, DropEmbedAuth, NamedNetworkUrl, PLAYOUT_FORMATS, PublicLicenseServerUrl, SdkPlayoutUrl, SrtPlayoutUrl} from "@/stores/lib/playoutUrls";
import {PermissionLevel} from "@/stores/DataStore";

type SummaryData = Pick<StreamMetadata,
  "videoStreamProbe" | "publishingVideo" | "publishingAudio" | "partTtl" | "persistent"
> & ProbeData;

// UI shape (camelCase), populated by LoadPlayoutConfigData.
type PlayoutConfigData = Pick<StreamMetadata,
  "drm" | "dvrEnabled" | "dvrMaxDuration" | "dvrStartTime" |
  "forensicWatermark" | "imageWatermark" | "simpleWatermark" | "watermarkType"
>;

type RecordingConfigData = Pick<StreamMetadata, "connectionTimeout" | "persistent" | "reconnectionTimeout"> & ProbeData & {
  copyMpegTs: boolean;
  inputCfg: RecordingInputCfg;
  multiPath: {
    enabled: boolean;
    stream_names: string[]
  };
  retention: string;
  // Assumed shape, pending fabric-team confirmation - see the note on
  // StreamEditStore's UpdateConfigMetadataParams.
  copyPackagingFormats: string[];
  alternateTranscodeEnabled: boolean;
  // Resolved from the id array stored on the fabric - see ResolveAlternateTranscodes.
  alternateTranscodes: AlternateTranscode[];
  programPidSelection: ProgramPidSelection;
  advancedEncodingParams: Record<string, unknown> | null;
};

export interface AudioDataEntry {
  bitrate: number;
  codec: string;
  record: boolean;
  recording_bitrate: number;
  recording_channels: number;
  playout: boolean;
  playout_label: string;
  lang: string | undefined;
  default?: boolean;
}

export type AudioDataMap = Record<string, AudioDataEntry>;

export interface ProbeData {
  audioStreams: ProbeStream[];
  audioData: AudioDataMap;
  programs?: RawProbeProgram[];
}

type GeneralConfigData = Pick<StreamMetadata,
  "title" | "description" | "display_title" | "originUrl" | "referenceUrl" | "configProfile" | "tags"
> & {
  permission: PermissionLevel;
  accessGroup: any;
};

export interface OutputUrlRow {
  label: string;
  url: string;
  // License server URL for DRM methods. When present the UI shows playout + license as sub-rows.
  licenseServerUrl?: string;
  // Named-network variant, authorized with an anonymous (qspace_id-only) token.
  publicUrl?: string;
  publicLicenseServerUrl?: string;
}

export interface StreamOutputUrls {
  embedUrl?: string;
  publicEmbedUrl?: string;
  playoutUrl?: string;
  publicPlayoutUrl?: string;
  // Default offering's rows - kept for callers that don't care about offering.
  playoutMethods: OutputUrlRow[];
  tsOnly?: boolean;
  // Same rows as playoutMethods, keyed by offering, for UI filtering by offering.
  playoutMethodsByOffering: Record<string, OutputUrlRow[]>;
  srtPlayoutUrl?: string;
  publicSrtPlayoutUrl?: string;
}

class StreamDetailStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeAutoObservable(this, {rootStore: false}, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  *LoadSummaryData({objectId, libraryId, slug}: {objectId: string, libraryId: string, slug: string}): Generator<any, SummaryData | Record<string, never>> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const [{audioStreams, audioData}, liveRecordingMeta, videoStream] = yield Promise.all([
        this.LoadStreamProbeData({objectId, libraryId}),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording/recording_config/recording_params",
          select: ["xc_params", "persistent", "part_ttl"]
        }),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording_config",
          select: ["probe_info/streams", "input_stream_info/streams"]
        })
      ]);

      const xcParams = liveRecordingMeta?.xc_params;
      const probeStreams = videoStream?.probe_info?.streams ?? videoStream?.input_stream_info?.streams ?? [];
      const videoStreamProbe = probeStreams.find(s => s.codec_type === "video");

      const summaryData = {
        videoStreamProbe,
        audioStreams,
        audioData,
        publishingVideo: {
          bit_rate: xcParams?.video_bitrate,
          frame_rate: videoStreamProbe?.frame_rate,
          resolution: xcParams?.enc_width ? `${xcParams.enc_width}x${xcParams.enc_height}p` : "",
          codec: "avc"
        },
        publishingAudio: {
          sample_rate: xcParams?.sample_rate
        },
        partTtl: liveRecordingMeta?.part_ttl?.toString() ?? null,
        persistent: liveRecordingMeta?.persistent
      };

      this.rootStore.streamStatusStore.UpdateStream({key: slug, value: summaryData});

      return summaryData;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load summary data", error);
      return {};
    }
  }

  *LoadGeneralConfigData({objectId, libraryId, slug}: {objectId: string, libraryId: string, slug: string}): Generator<any, Partial<GeneralConfigData>> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const [generalMeta, liveRecordingConfigMeta, liveRecordingOriginUrl, permission, accessGroup] = yield Promise.all([
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "public",
          select: ["name", "description", "asset_metadata/display_title", "asset_metadata/tags"]
        }),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording_config",
          select: ["url", "name", "reference_url"]
        }),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording/recording_config/recording_params/origin_url"
        }),
        this.rootStore.dataStore.LoadPermission({libraryId, objectId}),
        this.rootStore.dataStore.LoadAccessGroupPermissions({objectId})
      ]);

      const generalConfigData = {
        title: generalMeta?.name,
        description: generalMeta?.description,
        display_title: generalMeta?.asset_metadata?.display_title,
        tags: generalMeta?.asset_metadata?.tags ?? [],
        originUrl: liveRecordingConfigMeta?.url ?? liveRecordingOriginUrl,
        referenceUrl: liveRecordingConfigMeta?.reference_url,
        configProfile: slugify(liveRecordingConfigMeta?.name),
        permission,
        accessGroup
      };

      this.rootStore.streamStatusStore.UpdateStream({key: slug, value: generalConfigData});

      return generalConfigData;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load general config data", error);
      return {};
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

  *LoadRecordingConfigData({
    libraryId,
    objectId,
    slug
  }: {libraryId: string, objectId: string, slug: string}): Generator<any, Partial<RecordingConfigData>> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const [multipathMeta, liveRecordingMeta, liveRecordingConfigMeta, liveRecordingConfigTopMeta, {audioStreams, audioData, programs: probePrograms}] = yield Promise.all([
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording/fabric_config/multipath"
        }),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording/recording_config"
        }),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording_config/recording_config"
        }),
        // Sibling of recording_config on live_recording_config - see CreateAlternateTranscode.
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording_config",
          select: ["alternate_transcodes", "recording_params"]
        }),
        this.LoadStreamProbeData({libraryId, objectId})
      ]);

      const connectionTimeout = liveRecordingConfigMeta?.connection_timeout ?? liveRecordingMeta?.recording_params?.xc_params?.connection_timeout;
      const inputCfg = liveRecordingMeta?.recording_params?.xc_params?.input_cfg;
      const copyMpegTs = liveRecordingMeta?.recording_params?.xc_params?.copy_mpegts ?? Object.keys(inputCfg || {}).length > 0;
      const multiPath = multipathMeta;
      const persistent = liveRecordingMeta?.recording_params?.persistent;
      const retention = liveRecordingConfigMeta?.part_ttl ?? liveRecordingMeta?.recording_params?.part_ttl;
      const reconnectionTimeout = liveRecordingConfigMeta?.reconnect_timeout ?? liveRecordingMeta?.recording_params?.reconnect_timeout;

      // Existing streams predate these fields, hence the defaults.
      const copyPackagingFormats = liveRecordingConfigMeta?.copy_packaging_formats ?? [];
      const alternateTranscodeEnabled = liveRecordingConfigMeta?.alternate_transcode_enabled ?? false;
      // alternate_transcodes is an id array; resolve to full rows for display/edit.
      const alternateTranscodes = yield this.ResolveAlternateTranscodes({libraryId, ids: liveRecordingConfigTopMeta?.alternate_transcodes ?? []});

      // Detected programs/PID's, read-only - not part of the saved selection.
      // Prefer the probe; fall back to mpegts_selection, which has only program
      // numbers and a flat, program-unscoped PID list.
      const mpegtsSelection = inputCfg?.mpegts_selection;
      const programs: ProbeProgram[] = probePrograms?.length ?
        ProgramsFromProbe(probePrograms) :
        (mpegtsSelection?.program_ids ?? []).map(programId => ({
          id: `${programId}`,
          number: programId,
          name: `Program ${programId}`,
          pids: (mpegtsSelection?.pids ?? []).map(pid => ({pid}))
        }));

      const programPidSelection: ProgramPidSelection = {
        ...(liveRecordingConfigMeta?.program_pid_selection ?? {activeProgramId: null, selections: {}}),
        programs
      };
      const advancedEncodingParams = liveRecordingConfigTopMeta?.recording_params?.xc_params ?? null;

      const recordingData = {
        audioStreams,
        audioData,
        connectionTimeout,
        copyMpegTs,
        inputCfg,
        multiPath,
        persistent,
        reconnectionTimeout,
        retention,
        copyPackagingFormats,
        alternateTranscodeEnabled,
        alternateTranscodes,
        programPidSelection,
        advancedEncodingParams
      };

      this.rootStore.streamStatusStore.UpdateStream({key: slug, value: recordingData});

      return recordingData;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load recording config data", error);
      return {};
    }
  }

  *LoadPlayoutConfigData({libraryId, objectId, slug}: {libraryId: string, objectId: string, slug: string}): Generator<any, Partial<PlayoutConfigData>> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      // playoutFormatMeta is the fallback when the profile specifies no playout_formats.
      const [liveRecordingMeta, liveRecordingConfigMeta, liveRecordingOverridesMeta, playoutFormatMeta] = yield Promise.all([
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording/playout_config"
        }),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording_config/playout_config"
        }),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording_overrides/playout_config"
        }),
        this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "offerings/default/playout/playout_formats"
        })
      ]);

      let drm = liveRecordingOverridesMeta?.playout_formats ?? liveRecordingConfigMeta?.playout_formats ?? liveRecordingMeta?.playout_formats ?? Object.keys(playoutFormatMeta ?? {});
      // Playout formats must be an array of values from PLAYOUT_FORMAT_OPTIONS
      if(!Array.isArray(drm)) {
        drm = [];
      }
      const dvrEnabled = liveRecordingOverridesMeta?.dvr_enabled ?? liveRecordingConfigMeta?.dvr ?? liveRecordingMeta?.dvr_enabled;
      const rawDvrMax = liveRecordingOverridesMeta?.dvr_max_duration ?? liveRecordingMeta?.dvr_max_duration;
      const dvrMaxDuration = rawDvrMax === undefined ? null : rawDvrMax.toString();
      const dvrStartTime = liveRecordingOverridesMeta?.dvr_start_time ?? liveRecordingMeta?.dvr_start_time;
      const imageWatermark = liveRecordingOverridesMeta?.image_watermark ?? liveRecordingConfigMeta?.image_watermark ?? liveRecordingMeta?.image_watermark;
      const forensicWatermark = liveRecordingOverridesMeta?.forensic_watermark ?? liveRecordingConfigMeta?.forensic_watermark ?? liveRecordingMeta?.forensic_watermark;
      const simpleWatermark = liveRecordingOverridesMeta?.simple_watermark ?? liveRecordingConfigMeta?.simple_watermark ?? liveRecordingMeta?.simple_watermark;
      const watermarkType = simpleWatermark ? "TEXT" : imageWatermark ? "IMAGE" : forensicWatermark ? "FORENSIC" : "";

      const playoutData = {
        drm,
        dvrEnabled,
        dvrMaxDuration,
        dvrStartTime,
        forensicWatermark,
        imageWatermark,
        simpleWatermark,
        watermarkType
      };

      this.rootStore.streamStatusStore.UpdateStream({key: slug, value: playoutData});

      return playoutData;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load playout config data", error);
      return {};
    }
  }

  /**
   * Output URLs for one stream: embed URL, options URL, one playout URL per available
   * protocol/DRM method. All playout URLs carry the same week-long signed token.
   */
  *BuildStreamOutputUrls(objectId: string, {tsOnly = false}: {tsOnly?: boolean} = {}): Generator<any, StreamOutputUrls> {
    const result: StreamOutputUrls = {playoutMethods: [], playoutMethodsByOffering: {}};
    if(!objectId) { return result; }

    if(tsOnly) {
      result.tsOnly = true;
      const token = yield this.client.CreateSignedToken({
        objectId,
        subject: "elv-lsm",
        duration: 7 * 86400000
      }).catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`Unable to create signed token for ${objectId}`, error);
      });
      result.srtPlayoutUrl = token ? SrtPlayoutUrl({network: this.rootStore.networkInfo?.name, objectId, token}) : undefined;
      result.publicSrtPlayoutUrl = SrtPlayoutUrl({network: this.rootStore.networkInfo?.name, objectId});
      return result;
    }

    const anonymousToken = this.client.utils.B64(
      JSON.stringify({qspace_id: this.rootStore.contentSpaceId})
    );

    const Guard = (promise: any, message: string, fallback?: any) => {
      return Promise.resolve(promise).catch(error => {
        // eslint-disable-next-line no-console
        console.error(message, error);
        return fallback;
      });
    };

    // Gather offerings
    const sourcesByOffering = yield Guard(
      this.client.ContentObjectMetadata({
        libraryId: yield this.client.ContentObjectLibraryId({objectId}),
        objectId,
        metadataSubtree: "offerings"
      }),
      `Unable to load sources for ${objectId}`
    );
    const offerings = Object.keys(sourcesByOffering || {});
    if(offerings.length === 0) { offerings.push("default"); }

    // Part 1 - everything that needs only objectId, in parallel
    const [versionHash, signedToken, embedUrl, libraryId] = yield Promise.all([
      Guard(this.client.LatestVersionHash({objectId}), `Unable to load version hash for ${objectId}`),
      Guard(this.client.CreateSignedToken({
        objectId,
        subject: "elv-lsm",
        duration: 7 * 86400000 // 1 week
      }), `Unable to create signed token for ${objectId}`),
      Guard(this.EmbedUrl({objectId}), `Unable to load embed URL for ${objectId}`),
      Guard(this.client.ContentObjectLibraryId({objectId}), `Unable to load library id for ${objectId}`)
    ]);

    // Swap channel auth for the signed token when we have one
    const authArgs = signedToken ?
      {noAuth: true, queryParams: {authorization: signedToken}} :
      {channelAuth: true};

    result.srtPlayoutUrl = signedToken ? SrtPlayoutUrl({network: this.rootStore.networkInfo?.name, objectId, token: signedToken}) : undefined;
    result.publicSrtPlayoutUrl = SrtPlayoutUrl({network: this.rootStore.networkInfo?.name, objectId});

    if(embedUrl) {
      result.embedUrl = embedUrl;
      result.publicEmbedUrl = DropEmbedAuth(embedUrl);
    }

    const namedNetwork = {
      network: this.rootStore.networkInfo?.name,
      customDomain: this.rootStore.settingsStore.customDomain
    };

    // Part 2 - one full set of playout URLs per offering, in parallel
    const BuildOfferingUrls = async (offering: string) => {
      const [playoutOptions, rawPlayoutUrl, formatsMeta] = await Promise.all([
        Guard(this.client.PlayoutOptions({
          objectId,
          protocols: ["hls", "dash"],
          drms: ALL_DRMS,
          offering
        }), `Unable to load live playout options for ${objectId} (${offering})`),
        Guard(this.client.FabricUrl({
          libraryId,
          objectId,
          rep: `playout/${offering}/options.json`,
          ...authArgs
        }), `Unable to load playout options URL for ${objectId} (${offering})`),
        // Playout formats in precedence order: overrides -> config -> applied -> keys of the offering.
        // overrides/config/applied are the "default" offering's settings, not per-offering - only
        // read them for "default", or they'd wrongly win over every other offering's own formats.
        Guard(
          offering === "default" ?
            Promise.all([
              this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: "live_recording_overrides/playout_config/playout_formats"}),
              this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: "live_recording_config/playout_config/playout_formats"}),
              this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: "live_recording/playout_config/playout_formats"}),
              this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: `offerings/${offering}/playout/playout_formats`})
            ]) :
            this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: `offerings/${offering}/playout/playout_formats`})
              .then(offeringFormats => [undefined, undefined, undefined, offeringFormats]),
          `Unable to load playout formats for ${objectId} (${offering})`,
          []
        )
      ]);

      const liveMethods: Record<string, any> = {};
      Object.keys(playoutOptions || {}).forEach(protocol => {
        Object.keys(playoutOptions[protocol]?.playoutMethods || {}).forEach(drm => {
          liveMethods[`${protocol}-${drm}`] = playoutOptions[protocol].playoutMethods[drm];
        });
      });

      const [overrides, config, applied, offeringFormats] = formatsMeta || [];
      const configured = overrides ?? config ?? applied ?? Object.keys(offeringFormats || {});
      const formats: string[] = (Array.isArray(configured) ? configured : []).filter(format => PLAYOUT_FORMATS[format]);

      // One URL per format, in parallel, kept in `formats` order.
      // Prefer the URL from PlayoutOptions; fall back to the expected path when it's absent
      const methods = await Promise.all(formats.map(async format => {
        const {label, manifest, protocol, drm} = PLAYOUT_FORMATS[format];

        let rawUrl = SdkPlayoutUrl({url: liveMethods[`${protocol}-${drm}`]?.playoutUrl, signedToken});
        if(!rawUrl) {
          try {
            rawUrl = await this.client.FabricUrl({
              libraryId,
              objectId,
              rep: `playout/${offering}/${format}/${manifest}`,
              ...authArgs
            });
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error(`Unable to build playout URL for ${objectId} (${offering}/${format})`, error);
            return undefined;
          }
        }

        const licenseServers = liveMethods[`${protocol}-${drm}`]?.drms?.[drm]?.licenseServers;
        const licenseServerUrl = Array.isArray(licenseServers) && licenseServers.length > 0 ? licenseServers[0] : undefined;

        return {
          label,
          url: NamedNetworkUrl({url: rawUrl, objectId, ...namedNetwork}),
          licenseServerUrl,
          publicUrl: NamedNetworkUrl({url: rawUrl, objectId, ...namedNetwork, dropAuthorization: true}),
          publicLicenseServerUrl: licenseServerUrl ?
            PublicLicenseServerUrl({url: licenseServerUrl, versionHash, authorizationToken: anonymousToken}) :
            undefined
        };
      }));

      const resolvedMethods = methods.filter(Boolean);

      return {
        offering,
        playoutUrl: rawPlayoutUrl ? NamedNetworkUrl({url: rawPlayoutUrl, objectId, ...namedNetwork}) : undefined,
        publicPlayoutUrl: rawPlayoutUrl ? NamedNetworkUrl({url: rawPlayoutUrl, objectId, ...namedNetwork, dropAuthorization: true}) : undefined,
        methods: resolvedMethods
      };
    };

    const offeringResults = yield Promise.all(offerings.map(BuildOfferingUrls));

    // "default" wins as the offering-agnostic result; otherwise the first offering does.
    offeringResults.forEach(({offering, playoutUrl, publicPlayoutUrl, methods}) => {
      result.playoutMethodsByOffering[offering] = methods;
      if(offering === "default" || !result.playoutUrl) {
        result.playoutUrl = playoutUrl;
        result.publicPlayoutUrl = publicPlayoutUrl;
        result.playoutMethods = methods;
      }
    });

    return result;
  }

  /**
   * Output URLs for several streams, keyed by objectId. `onStreamUrls`, if given, fires
   * per stream as each resolves so callers can render incrementally.
   */
  *StreamOutputUrls(
    objectIds: string[],
    {onStreamUrls, tsOnlyIds}: {onStreamUrls?: (objectId: string, urls: StreamOutputUrls) => void, tsOnlyIds?: Set<string>} = {}
  ): Generator<any, Record<string, StreamOutputUrls>> {
    const result: Record<string, StreamOutputUrls> = {};

    yield this.client.utils.LimitedMap(
      5,
      objectIds || [],
      async (objectId: string) => {
        if(!objectId) { return; }
        const urls = await this.BuildStreamOutputUrls(objectId, {tsOnly: tsOnlyIds?.has(objectId)}) as unknown as StreamOutputUrls;
        result[objectId] = urls;
        onStreamUrls?.(objectId, urls);
      }
    );

    return result;
  }

  *LoadStreamMetadata({objectId, libraryId}: {objectId: string, libraryId?: string}): Generator<any, Partial<StreamMetadata> | undefined> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const liveRecordingConfigMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config"
      });

      const liveRecordingMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording"
      });

      const generalMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "public",
        select: [
          "asset_metadata/display_title",
          "asset_metadata/profile_last_updated",
          "description",
          "name"
        ]
      });

      let probeMeta = liveRecordingConfigMeta?.probe_info;

      // Phase out as new streams will have live_recording_config/probe_info
      if(!probeMeta) {
        probeMeta = yield this.client.ContentObjectMetadata({
          objectId,
          libraryId,
          metadataSubtree: "/live_recording/probe_info",
          select: [
            "format/filename",
            "streams"
          ]
        });
      }

      const status = yield this.client.StreamStatus({name: objectId});

      // General Config
      const configProfileName = liveRecordingConfigMeta?.name;
      const inputCfg = liveRecordingMeta?.recording_config?.recording_params?.xc_params?.input_cfg ?? liveRecordingConfigMeta?.recording_config?.input_cfg;

      const {source, packaging} = DeriveSourceAndPackaging({
        url: liveRecordingConfigMeta?.url,
        inputCfg
      });

      // Recording Config
      const connectionTimeout = liveRecordingConfigMeta?.recording_config?.connection_timeout ?? liveRecordingMeta?.recording_config?.recording_params?.xc_params?.connection_timeout;
      const partTtl = liveRecordingConfigMeta?.recording_config?.part_ttl ?? liveRecordingMeta?.recording_config?.recording_params?.part_ttl;
      const reconnectionTimeout = liveRecordingConfigMeta?.recording_config?.reconnect_timeout ?? liveRecordingMeta?.recording_config?.recording_params?.reconnect_timeout;

      // Playout Config
      const drm = liveRecordingConfigMeta?.playout_config?.playout_formats ?? liveRecordingMeta?.playout_config?.playout_formats;
      const dvrMaxDuration = liveRecordingMeta?.playout_config?.dvr_max_duration;
      const imageWatermark = liveRecordingConfigMeta?.playout_config?.image_watermark ?? liveRecordingMeta?.playout_config?.image_watermark;
      const forensicWatermark = liveRecordingConfigMeta?.playout_config?.forensic_watermark ?? liveRecordingMeta?.playout_config?.forensic_watermark;
      const simpleWatermark = liveRecordingConfigMeta?.playout_config?.simple_watermark ?? liveRecordingMeta?.playout_config?.simple_watermark;

      // Stream Table Details
      const audioStreamCount = probeMeta?.streams ? (probeMeta?.streams || []).filter(stream => stream.codec_type === "audio").length : undefined;
      const videoStream = (probeMeta?.streams || []).find(stream => stream.codec_type === "video");

      // Other Details
      const egressEnabled = liveRecordingConfigMeta?.srt_egress_enabled;
      const profileLastUpdated = generalMeta?.asset_metadata?.profile_last_updated;
      const publishingVideo = {
        bit_rate: liveRecordingMeta?.recording_config?.recording_params?.xc_params?.video_bitrate,
        frame_rate: videoStream?.frame_rate,
        resolution: liveRecordingMeta?.recording_config?.recording_params?.xc_params?.enc_width ? `${liveRecordingMeta?.recording_config?.recording_params?.xc_params?.enc_width}x${liveRecordingMeta?.recording_config?.recording_params?.xc_params?.enc_height}p` : "",
        codec: "avc",
        bytes: status?.recordingStatus?.video?.bytes_written
      };
      const publishingAudio = {
        sample_rate: liveRecordingMeta?.recording_config?.recording_params?.xc_params?.sample_rate
      };
      const sourceInputStats = {
        packets_received: status?.input_stats?.ts?.packets_received ?? 0,
        packets_dropped: status?.input_stats?.ts?.packets_dropped ?? 0,
        packetsPercentage: status?.input_stats?.ts?.packets_received !== undefined ? parseFloat((status?.input_stats?.ts?.packets_dropped / status?.input_stats?.ts?.packets_received).toFixed(2)) : 0,
        seq_num_skip_tot: status?.input_stats?.rtp?.seq_num_skip_tot ?? 0,
        seq_num_skip_count: status?.input_stats?.rtp?.seq_num_skip_count ?? 0
      };

      return {
        // Stream Table Details
        audioStreamCount,
        codecName: videoStream?.codec_name,
        packaging,
        source,
        videoBitrate: videoStream?.bit_rate,
        // General Config
        configProfile: slugify(configProfileName),
        description: generalMeta?.description,
        display_title: generalMeta?.asset_metadata?.display_title,
        originUrl: liveRecordingConfigMeta?.url ?? liveRecordingMeta?.recording_config?.recording_params?.origin_url,
        referenceUrl: liveRecordingConfigMeta?.reference_url,
        title: generalMeta?.name,
        // Recording Config
        connectionTimeout: connectionTimeout ? connectionTimeout.toString() : null,
        partTtl: partTtl ? partTtl.toString() : null,
        persistent: liveRecordingMeta?.recording_config?.recording_params?.persistent,
        reconnectionTimeout: reconnectionTimeout ? reconnectionTimeout.toString() : null,
        // Playout Config
        drm,
        dvrEnabled: liveRecordingConfigMeta?.playout_config?.dvr ?? liveRecordingMeta?.playout_config?.dvr_enabled,
        dvrMaxDuration: dvrMaxDuration === undefined ? null : dvrMaxDuration.toString(),
        dvrStartTime: liveRecordingMeta?.playout_config?.dvr_start_time,
        forensicWatermark,
        imageWatermark,
        simpleWatermark,
        watermarkType: simpleWatermark ? "TEXT" : imageWatermark ? "IMAGE" : forensicWatermark ? "FORENSIC" : "",
        // Other Details
        egressEnabled,
        profileLastUpdated,
        videoStreamProbe: videoStream,
        publishingVideo,
        publishingAudio,
        sourceInputStats
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load stream metadata", error);
    }
  }

  *LoadDetails({libraryId, objectId, slug}: {libraryId: string, objectId: string, slug: string}): Generator<any, void> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const streamMeta = yield this.client.ContentObjectMetadata({
        objectId,
        libraryId,
        metadataSubtree: "public",
        select: [
          "name",
          "description",
          "asset_metadata/display_title",
          "asset_metadata/title",
          "asset_metadata/tags"
        ]
      });

      const urlMeta = yield this.client.ContentObjectMetadata({
        objectId,
        libraryId,
        metadataSubtree: "/",
        select: [
          "live_recording_config/url",
          "live_recording/recording_config/recording_params/origin_url"
        ]
      });

      this.rootStore.streamStatusStore.UpdateStream({
        key: slug,
        value: {
          title: streamMeta?.name,
          description: streamMeta.description,
          display_title: streamMeta.asset_metadata?.display_title,
          tags: streamMeta.asset_metadata?.tags ?? [],
          originUrl: urlMeta?.live_recording?.recording_config?.recording_params?.origin_url || urlMeta?.live_recording_config?.url
        }
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load stream metadata", error);
    }
  }

  *LoadEdgeWriteTokenMeta({
    objectId,
    libraryId
  }: {objectId: string, libraryId: string}): Generator<any, Record<string, any>> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const edgeWriteToken = yield this.client.ContentObjectMetadata({
        objectId,
        libraryId,
        metadataSubtree: "/live_recording/fabric_config/edge_write_token"
      });

      if(!edgeWriteToken) { return {}; }

      let metadata;
      try {
        metadata = yield this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          writeToken: edgeWriteToken,
          metadataSubtree: "live_recording",
          select: ["recordings", "recording_config"]
        });
      } catch(error) {
        // eslint-disable-next-line no-console
        console.error("Unable to load edge write token metadata", error);
      }

      return {
        // First stream recording start time
        _recordingStartTime: metadata?.recording_config?.recording_start_time,
        ...metadata?.recordings
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load metadata with edge write token", error);
      return {};
    }
  }

  *LoadStreamProbeData({
    objectId,
    libraryId
  }: {objectId: string, libraryId: string}): Generator<any, ProbeData> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      let probeMetadataOptions = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config",
        select: [
          "probe_info",
          "input_stream_info"
        ]
      });

      let probeMetadata = probeMetadataOptions?.probe_info ?? probeMetadataOptions?.input_stream_info;

      // Phase out as new streams will have live_recording_config/input_stream_info or /probe_info
      if(!probeMetadata) {
        probeMetadata = yield this.client.ContentObjectMetadata({
          libraryId,
          objectId,
          metadataSubtree: "live_recording/probe_info",
        });
      }

      if(!probeMetadata) {
        return {audioStreams: [], audioData: {}};
      }

      const audioConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config/recording_stream_config/audio"
      });

      // If profile has no audio data, get ladderSpecs for default value
      const ladderSpecs = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/recording_config/recording_params/ladder_specs"
      });
      const audioLadderSpecs = (ladderSpecs || []).filter(spec => spec.representation.includes("audio"));

      const audioStreams = (probeMetadata.streams || [])
        .filter(stream => stream.codec_type === "audio");

      // Map used for form data
      const audioData = {};
      audioStreams.forEach((spec, i) => {
        const audioConfigForIndex = audioConfig && audioConfig[spec.stream_index] ? audioConfig[spec.stream_index] : {};
        const audioLadderSpecForIndex = audioLadderSpecs.find(ladderSpec => ladderSpec.stream_index === spec.stream_index);

        const initBitrate = RECORDING_BITRATE_OPTIONS.map(option => option.value).includes(spec.bit_rate) ? spec.bit_rate : 192000;

        audioData[spec.stream_index] = {
          bitrate: spec.bit_rate,
          codec: spec.codec_name,
          record: Object.hasOwn(audioConfigForIndex, "record") ? audioConfigForIndex.record : true,
          recording_bitrate: initBitrate,
          recording_channels: spec.channels,
          playout: Object.hasOwn(audioConfigForIndex, "playout") ? audioConfigForIndex.playout : true,
          playout_label: audioConfigForIndex.playout_label || `Audio ${i + 1}`,
          lang: audioConfigForIndex?.lang,
          default: audioConfigForIndex?.default ?? audioLadderSpecForIndex?.default ?? false
        };
      });

      return {
        audioStreams,
        audioData,
        programs: probeMetadata.programs ?? []
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load live_recording metadata", error);
      return {audioStreams: [], audioData: {}};
    }
  }

  EmbedUrl = ({objectId}: {objectId: string}): string => {
    try {
      return this.client.EmbedUrl({objectId, mediaType: "live_video"});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load embed url", error);
      return "";
    }
  };
}

export default StreamDetailStore;
