// Manages runtime stream state: the streams map, status polling, live control (start, stop, deactivate), and frame preview.
import {makeAutoObservable} from "mobx";
import UrlJoin from "url-join";
import {slugify} from "@eluvio/elv-client-js/utilities/lib/helpers.js";
import {RECORDING_BITRATE_OPTIONS} from "@/utils/constants";
import {
  DeriveSourceAndPackaging,
  StreamMetadata, ProbeStream, RecordingInputCfg
} from "@/utils/stream";
import RootStore from "@/stores/RootStore";
import {StreamInfo, PermissionLevel} from "@/stores/DataStore";
import {StreamOp} from "@/stores/ModalStore";

type SummaryData = Pick<StreamMetadata,
  "videoStreamProbe" | "publishingVideo" | "publishingAudio" | "partTtl" | "persistent"
> & ProbeData;

// Processed shape for the UI — camelCase, populated by LoadPlayoutConfigData
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
}

type StreamListData = Pick<StreamMetadata, "title" | "originUrl" | "source" | "packaging" | "inputCfg">;

type GeneralConfigData = Pick<StreamMetadata,
  "title" | "description" | "display_title" | "originUrl" | "referenceUrl" | "configProfile"
> & {
  permission: PermissionLevel;
  accessGroup: any;
};

interface StreamFrameUrl {
  timestamp: number;
  promise: Generator<any, string | undefined> | Promise<unknown>;
  url?: string;
}

type StreamMap = Record<string, StreamInfo>;

class StreamStore {
  streams: StreamMap;
  streamFrameUrls: Record<string, StreamFrameUrl> = {};
  showMonitorPreviews = false;
  loadingStatus = false;
  tableFilter = "";
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this);
  }

  get client() {
    return this.rootStore.client;
  }

  get streamsByObjectId(): {[k:string]: string} {
    return Object.fromEntries(
      Object.entries(this.streams || {}).map(([slug, s]) => [s.objectId, slug])
    );
  }

  get filteredStreams(): StreamInfo[] {
    const filter = this.tableFilter.toLowerCase();
    return Object.values(this.streams || {}).filter(s =>
      !filter ||
      s.title?.toLowerCase().includes(filter) ||
      s.objectId?.toLowerCase().includes(filter)
    );
  }

  ToggleMonitorPreviews() {
    this.showMonitorPreviews = !this.showMonitorPreviews;
  }

  UpdateStream = ({key, value={}}: {key: string, value?: Partial<StreamInfo>}) => {
    if(!key) { return; }

    this.streams[key] = {
      ...(this.streams[key] || {}),
      ...value,
      slug: key
    } as StreamInfo;
  };

  UpdateStreams = ({streams}: {streams: StreamMap}) => {
    this.streams = streams;
  };

  SetTableFilter = (filter: string) => {
    this.tableFilter = filter;
  };

  *CheckStatus({
    objectId,
    slug,
    showParams=false,
    update=false
  }: {objectId: string, slug?: string, showParams?: boolean, update?: boolean}): Generator<any, void | {}> {
    let response;
    try {
      response = yield this.client.StreamStatus({
        name: objectId,
        showParams
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load status for ${objectId || "object"}`, error);
      return {};
    }

    if(update) {
      if(!slug) {
        slug = Object.keys(this.streams || {}).find(slug => (
          this.streams[slug].objectId === objectId
        ));
      }

      this.UpdateStream({
        key: slug,
        value: {
          status: response.state,
          warnings: response.warnings,
          quality: response.quality,
          embedUrl: response?.playoutUrls?.embedUrl
        }
      });
    }

    return response;
  }

  *AllStreamsStatus(reload=false): Generator<any, void> {
    if(this.loadingStatus && !reload) { return; }

    try {
      this.loadingStatus = true;

      yield this.client.utils.LimitedMap(
        15,
        Object.keys(this.streams || {}),
        async slug => {
          const streamMeta = this.streams?.[slug];
          try {
            await this.CheckStatus({
              objectId: streamMeta.objectId,
              slug,
              update: true
            });
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error(`Skipping status for ${this.streams?.[slug].objectId || slug}.`, error);
          }
        }
      );
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      this.loadingStatus = false;
    }
  }

  // Live Stream Controls

  *StartStream({
    slug,
    start=false
  }: {slug: string, start?: boolean}): Generator<any, void> {
    const objectId = this.streams[slug].objectId;
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    const response = yield this.CheckStatus({
      objectId: this.streams[slug].objectId
    });
    switch(response.state) {
      case "unconfigured":
      case "uninitialized":
        throw Error("Stream not ready to start");
      case "starting":
      case "running":
      case "stalled":
        return;
    }

    const edgeWriteToken = response.edgeWriteToken;

    let tokenMeta;

    if(edgeWriteToken) {
      tokenMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/status/edge_write_token"
      });
    }

    if(!tokenMeta || tokenMeta !== edgeWriteToken) {
      yield this.client.StreamStartRecording({name: objectId, start});
    }

    yield this.OperateLRO({
      objectId,
      slug,
      operation: "START"
    });
  }

  *OperateLRO({
    objectId,
    slug,
    operation
  }: {objectId: string, slug: string, operation: StreamOp}): Generator<any, void> {
    const OP_MAP = {
      START: "start",
      RESET: "reset",
      STOP: "stop"
    };

    try {
      const response = yield this.client.StreamStartOrStopOrReset({
        name: objectId,
        op: OP_MAP[operation]
      });

      if(response?.error) {
        throw new Error(response.error);
      }

      this.UpdateStream({key: slug, value: { status: response.state }});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to ${OP_MAP[operation]} LRO.`, error);
      throw error;
    }
  }

  *DeactivateStream({objectId, slug}: {objectId: string, slug: string}): Generator<any, void> {
    try {
      const response = yield this.client.StreamStopRecording({name: objectId});

      if(!response) { return; }

      this.UpdateStream({key: slug, value: { status: response.state }});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to deactivate stream", error);
    }
  }

  async FetchVideoPath(stream: StreamInfo, playlistPath: string): Promise<Response> {
    const [path, params] = playlistPath.split("?");
    const searchParams = new URLSearchParams(params);
    searchParams.delete("authorization");

    const browserSupportedDrms = (await this.client.AvailableDRMs() || []).filter(drm => ["clear", "aes-128"].includes(drm));

    let playoutOptions, playoutMethods, playoutMethod;
    playoutOptions = await this.client.PlayoutOptions({
      objectId: stream.objectId,
      protocols: ["hls"],
      drms: browserSupportedDrms,
      offering: "default"
    });

    playoutMethods = playoutOptions?.hls?.playoutMethods;

    if(playoutMethods["clear"]) {
      playoutMethod = "hls-clear";
    } else if(playoutMethods["aes-128"]) {
      playoutMethod = "hls-aes128";
    } else if(playoutMethods["fairplay"]) {
      playoutMethod = "hls-fairplay";
    } else if(playoutMethods["sample-aes"]) {
      playoutMethod = "hls-sample-aes";
    }

    const url = new URL(
      await this.client.FabricUrl({
        libraryId: await this.client.ContentObjectLibraryId({objectId: stream.objectId}),
        objectId: stream.objectId,
        rep: UrlJoin(`/playout/default/${playoutMethod}`, path),
        queryParams: Object.fromEntries(searchParams),
        noAuth: true,
        channelAuth: true
      })
    );

    const authToken = url.searchParams.get("authorization");
    url.searchParams.delete("authorization");

    return await fetch(
      url,
      { headers: { Authorization: `Bearer ${authToken}`}}
    );
  }

  *FetchStreamFrameURL(slug: string): Generator<any, string> {
    try {
      const stream = this.streams[slug];

      if(!stream) {
        return;
      }

      const playlist = yield(yield this.FetchVideoPath(stream, "playlist.m3u8")).text();

      let lowestBitratePath = playlist
        .split("\n")
        .filter(line => line.startsWith("video/video"))
        .reverse()[0];

      if(!lowestBitratePath) {
        return;
      }

      const segmentPlaylist = yield(yield this.FetchVideoPath(stream, lowestBitratePath)).text();

      if(!segmentPlaylist) {
        return;
      }

      const initSegmentPath = segmentPlaylist
        .split("\n")
        .filter(line => line.includes("init.m4s"))[0]
        .split("\"")[1].replaceAll("\"", "");

      const segmentPath = segmentPlaylist
        .split("\n")
        .filter(line => /^.*\.m4s/.test(line))
        .reverse()[0];

      const segmentBasePath = lowestBitratePath
        .split("?")[0]
        .split("/").slice(0, -1)
        .join("/");

      const [videoInitSegment, videoSegment] = yield Promise.all([
        this.FetchVideoPath(
          stream,
          UrlJoin(segmentBasePath, initSegmentPath)
        ),
        this.FetchVideoPath(
          stream,
          UrlJoin(segmentBasePath, segmentPath)
        )
      ]);

      const url = URL.createObjectURL(
        new Blob([
          yield videoInitSegment.arrayBuffer(),
          yield videoSegment.arrayBuffer()
        ])
      );

      this.streamFrameUrls[slug] = {
        ...this.streamFrameUrls[slug],
        url
      };

      return url;
    } catch(error) {
      /* eslint-disable no-console */
      console.error("Error fetching frame for " + slug);
      console.error(error);
      /* eslint-disable no-console */
      return;
    } finally {
      console.timeEnd(`Load Frame: ${slug}`);
    }
  }

  *StreamFrameURL(slug: string): Generator<any, string | undefined> {
    const existingUrl = this.streamFrameUrls[slug];

    if(existingUrl && Date.now() - existingUrl.timestamp < 60000) {
      return yield existingUrl.url;
    } else if(existingUrl) {
      URL.revokeObjectURL(yield existingUrl.url);
    }

    this.streamFrameUrls[slug] = {
      timestamp: Date.now(),
      promise: this.FetchStreamFrameURL(slug)
    };

    const url = yield this.streamFrameUrls[slug].promise;

    if(!url) {
      delete this.streamFrameUrls[slug];
    }

    return url;
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

      this.UpdateStream({key: slug, value: summaryData});

      return summaryData;
    } catch(error) {

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
          select: ["name", "description", "asset_metadata/display_title"]
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
        originUrl: liveRecordingConfigMeta?.url ?? liveRecordingOriginUrl,
        referenceUrl: liveRecordingConfigMeta?.reference_url,
        configProfile: slugify(liveRecordingConfigMeta?.name),
        permission,
        accessGroup
      };

      this.UpdateStream({key: slug, value: generalConfigData});

      return generalConfigData;
    } catch(error) {

      console.error("Unable to load general config data", error);
      return {};
    }
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

      const [multipathMeta, liveRecordingMeta, liveRecordingConfigMeta, {audioStreams, audioData}] = yield Promise.all([
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
        this.LoadStreamProbeData({libraryId, objectId})
      ]);

      const connectionTimeout = liveRecordingConfigMeta?.connection_timeout ?? liveRecordingMeta?.recording_params?.xc_params?.connection_timeout;
      const inputCfg = liveRecordingMeta?.recording_params?.xc_params?.input_cfg;
      const copyMpegTs = liveRecordingMeta?.recording_params?.xc_params?.copy_mpegts ?? Object.keys(inputCfg || {}).length > 0;
      const multiPath = multipathMeta;
      const persistent = liveRecordingMeta?.recording_params?.persistent;
      const retention = liveRecordingConfigMeta?.part_ttl ?? liveRecordingMeta?.recording_params?.part_ttl;
      const reconnectionTimeout = liveRecordingConfigMeta?.reconnect_timeout ?? liveRecordingMeta?.recording_params?.reconnect_timeout;

      const recordingData = {
        audioStreams,
        audioData,
        connectionTimeout,
        copyMpegTs,
        inputCfg,
        multiPath,
        persistent,
        reconnectionTimeout,
        retention
      };

      this.UpdateStream({key: slug, value: recordingData});

      return recordingData;
    } catch(error) {

      console.error("Unable to load recording config data", error);
      return {};
    }
  }

  *LoadPlayoutConfigData({libraryId, objectId, slug}: {libraryId: string, objectId: string, slug: string}): Generator<any, Partial<PlayoutConfigData>> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      // Special case: playoutFormatMeta is a fallback when profile has no playout_formats specified
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

      this.UpdateStream({key: slug, value: playoutData});

      return playoutData;
    } catch(error) {

      console.error("Unable to load playout config data", error);
      return {};
    }
  }

  *LoadStreams({streamMetadata}: {streamMetadata: StreamMap}) {
    yield this.client.utils.LimitedMap(
      10,
      Object.keys(streamMetadata),
      async slug => {
        try {
          const stream = streamMetadata[slug];

          let versionHash = stream?.["."]?.source ?? stream.versionHash;

          if(!versionHash) {
            const match = stream?.["/"].match(/(hq__[^/]+)/);
            versionHash = match ? match[1] : undefined;
          }

          if(versionHash) {
            const objectId = this.client.utils.DecodeVersionHash(versionHash).objectId;
            const libraryId = await this.client.ContentObjectLibraryId({objectId});

            streamMetadata[slug].slug = slug;
            streamMetadata[slug].objectId = objectId;
            streamMetadata[slug].versionHash = versionHash;
            streamMetadata[slug].libraryId = libraryId;

            const streamDetails = await this.LoadStreamListData({
              objectId,
              libraryId
            }) || {};

            Object.keys(streamDetails).forEach(detail => {
              streamMetadata[slug][detail] = streamDetails[detail];
            });
          } else {

            console.error(`No version hash for ${slug}`);
          }
        } catch(error) {

          console.error(`Failed to load stream ${slug}`, error);
        }
      }
    );

    this.UpdateStreams({streams: streamMetadata});
  }

  *LoadStreamListData({libraryId, objectId}: {libraryId: string, objectId: string}): Generator<any, StreamListData | undefined> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const meta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        select: [
          "public/name",
          "live_recording/recording_config/recording_params/xc_params/input_cfg",
          "live_recording_config/url",
          "live_recording_config/recording_config/input_cfg"
        ]
      });

      const url = meta?.live_recording_config?.url;
      const inputCfg = meta?.live_recording?.recording_config?.recording_params?.xc_params?.input_cfg ?? meta?.live_recording_config?.recording_config?.input_cfg;
      const {source, packaging} = DeriveSourceAndPackaging({
        url,
        inputCfg
      });

      return {
        title: meta?.public?.name,
        originUrl: url,
        source,
        packaging,
        inputCfg
      };
    } catch(error) {

      console.error("Unable to load stream list data", error);
    }
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
          "asset_metadata/title"
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

      this.UpdateStream({
        key: slug,
        value: {
          title: streamMeta?.name,
          description: streamMeta.description,
          display_title: streamMeta.asset_metadata?.display_title,
          originUrl: urlMeta?.live_recording?.recording_config?.recording_params?.origin_url || urlMeta?.live_recording_config?.url
        }
      });
    } catch(error) {

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

        console.error("Unable to load edge write token metadata", error);
      }

      return {
        // First stream recording start time
        _recordingStartTime: metadata?.recording_config?.recording_start_time,
        ...metadata?.recordings
      };
    } catch(error) {

      console.error("Unable to load metadata with edge write token", error);
      return {};
    }
  }

  *LoadStreamProbeData({
    objectId,
    libraryId
  }: {objectId: string, libraryId: string}): Generator<any, ProbeData | undefined> {
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
        audioData
      };
    } catch(error) {

      console.error("Unable to load live_recording metadata", error);
    }
  }

  EmbedUrl = ({objectId}: {objectId: string}): string => {
    try {
      return this.client.EmbedUrl({objectId, mediaType: "live_video"});
    } catch(error) {

      console.error("Unable to load embed url", error);
      return "";
    }
  };
}

export default StreamStore;
