// Manages runtime stream state: the streams map, status polling, live control (start, stop, deactivate), and frame preview.
import {makeAutoObservable} from "mobx";
import UrlJoin from "url-join";
import {slugify, WithTimeout, FormatDateFilter, GetDateRangePreset, DEFAULT_DATE_PRESET, type DateRangePreset} from "@/utils/helpers";
import {LIVE_STREAM_DATE_TAG_KEY, LIVE_STREAM_DATE_TAG_PREFIX, RECORDING_BITRATE_OPTIONS, STATUS_MAP, type StreamStatus} from "@/utils/constants";
import {
  DeriveSourceAndPackaging,
  StreamMetadata, ProbeStream, RecordingInputCfg
} from "@/utils/stream";
import type RootStore from "@/stores/RootStore";
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

type StreamListData = Pick<StreamMetadata, "title" | "display_title" | "originUrl" | "source" | "packaging" | "inputCfg" | "tags">;

type GeneralConfigData = Pick<StreamMetadata,
  "title" | "description" | "display_title" | "originUrl" | "referenceUrl" | "configProfile" | "tags"
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

interface TenantContentVersion {
  id: string;
  hash: string;
  type: string;
  object_version: number;
  error: string;
  // Indexed query fields returned by the tenant query (versions[].query_fields).
  // A value may be single or an array, depending on the index definition.
  query_fields?: Record<string, unknown>;
  // Selected metadata subtree returned inline by the tenant query (versions[].meta),
  // keyed by path exactly like ContentObjectMetadata's response. Present when the query
  // requests the streams-list paths (public/name, public/asset_metadata/tags,
  // live_recording_config/url, ...input_cfg).
  meta?: Record<string, any>;
}

/** Pull a single value out of a query field (arrays -> first entry). */
const QueryFieldValue = (fields: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = Array.isArray(fields?.[key]) ? (fields?.[key] as unknown[])[0] : fields?.[key];
  return value == null || value === "" ? undefined : String(value);
};

/**
 * Derive the streams-list fields from an object's metadata subtree. Shared by the
 * per-object fetch (LoadStreamListData) and the tenant query's `meta` so the two
 * never drift.
 */
const StreamListDataFromMeta = (meta: Record<string, any> | undefined): StreamListData => {
  const url = meta?.live_recording_config?.url;
  const inputCfg =
    meta?.live_recording?.recording_config?.recording_params?.xc_params?.input_cfg ??
    meta?.live_recording_config?.recording_config?.input_cfg;
  const {source, packaging} = DeriveSourceAndPackaging({url, inputCfg});

  return {
    title: meta?.public?.name,
    display_title: meta?.public?.asset_metadata?.display_title,
    tags: meta?.public?.asset_metadata?.tags ?? [],
    originUrl: url,
    source,
    packaging,
    inputCfg
  };
};

/**
 * Build the StreamInfo fields from a tenant query version: name/date/title_id from
 * query_fields, plus the streams-list fields from `meta` when present (letting the
 * content-group path skip the per-object metadata fetch entirely).
 */
const StreamInfoFromTenantVersion = (version: TenantContentVersion): Partial<StreamInfo> => {
  const name = QueryFieldValue(version.query_fields, "name");
  const date = QueryFieldValue(version.query_fields, "date");
  const titleId = QueryFieldValue(version.query_fields, "title_id");

  const info: Partial<StreamInfo> = {versionHash: version.hash};

  if(version.meta) {
    const listData = StreamListDataFromMeta(version.meta);
    if(listData.title != null) { info.title = listData.title; }
    if(listData.display_title != null) { info.display_title = listData.display_title; }
    if(listData.tags?.length) { info.tags = listData.tags; }
    if(listData.originUrl != null) { info.originUrl = listData.originUrl; }
    if(listData.source?.length) { info.source = listData.source; }
    if(listData.packaging?.length) { info.packaging = listData.packaging; }
    // inputCfg isn't on StreamInfo's type but _EnrichStreams already attaches it the same way.
    if(listData.inputCfg != null) { (info as any).inputCfg = listData.inputCfg; }
  }

  if(name != null) {
    info.name = name;
    if(info.title == null) { info.title = name; }
  }
  if(date != null) { info.date = date; }
  if(titleId != null) { info.titleId = titleId; }

  return info;
};

interface TenantContentPaging {
  start?: number;
  limit?: number;
  total?: number;
  items?: number;
  pages?: number;
  next?: number | null;
  more?: boolean;
}

// Streams-page date filter, persisted so it survives navigating to a stream detail
// page and back (and a page reload) - mirrors StreamGroupStore's expandedGroups.
const STREAMS_DATE_FILTER_KEY = "elv-streams-date-filter";

const LoadPersistedDateFilter = (): {preset: DateRangePreset, referenceDate: Date} => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STREAMS_DATE_FILTER_KEY) || "null");
    if(raw?.preset) {
      const date = raw.referenceDate ? new Date(raw.referenceDate) : new Date();
      return {preset: raw.preset, referenceDate: isNaN(date.getTime()) ? new Date() : date};
    }
  } catch { /* sessionStorage unavailable / malformed - fall through to default */ }
  return {preset: DEFAULT_DATE_PRESET, referenceDate: new Date()};
};

const OBJECT_LOOKUP_TIMEOUT_MS = 15000;
const STREAM_STATUS_TIMEOUT_MS = 10000;
const TENANT_CONTENT_PAGE_SIZE = 100;
// TenantContent must be served by this fabric node - the client is pinned to it
// per query and the region is reset afterward.
const TENANT_CONTENT_NODE_URI = "https://host-154-14-243-34.contentfabric.io";
// Meta paths needed to build StreamInfo from a tenant query version without a per-object fetch.
const TENANT_CONTENT_SELECT = [
  "public/name",
  "public/asset_metadata/display_title",
  "public/asset_metadata/tags",
  "live_recording/recording_config/recording_params/xc_params/input_cfg",
  "live_recording_config/url",
  "live_recording_config/recording_config/input_cfg"
];

// All DRM schemes we ask PlayoutOptions about, so the response carries every
// available protocol/method the stream offers.
const ALL_DRMS = ["clear", "aes-128", "sample-aes", "widevine", "fairplay", "playready"];

// Configured playout-format keys (constants.ts PLAYOUT_FORMAT_OPTIONS) mapped to the
// manifest filename plus the {protocol, drm} pair PlayoutOptions returns - so each row
// can be built deterministically (works before the stream has ever run) and then
// enriched with a license-server URL when the stream is live.
const PLAYOUT_FORMATS: Record<string, {label: string, manifest: string, protocol: string, drm: string}> = {
  "hls-clear":          {label: "HLS Clear",      manifest: "playlist.m3u8", protocol: "hls",  drm: "clear"},
  "hls-aes128":         {label: "HLS AES-128",    manifest: "playlist.m3u8", protocol: "hls",  drm: "aes-128"},
  "hls-sample-aes":     {label: "HLS Sample AES", manifest: "playlist.m3u8", protocol: "hls",  drm: "sample-aes"},
  "hls-fairplay":       {label: "HLS FairPlay",   manifest: "playlist.m3u8", protocol: "hls",  drm: "fairplay"},
  "hls-widevine-cenc":  {label: "HLS Widevine",   manifest: "playlist.m3u8", protocol: "hls",  drm: "widevine"},
  "hls-playready-cenc": {label: "HLS PlayReady",  manifest: "playlist.m3u8", protocol: "hls",  drm: "playready"},
  "dash-clear":         {label: "Dash Clear",     manifest: "dash.mpd",      protocol: "dash", drm: "clear"},
  "dash-widevine":      {label: "Dash Widevine",  manifest: "dash.mpd",      protocol: "dash", drm: "widevine"}
};

// Named-network hostname map for building public playout URLs - mirrors elv-client-js's
// internal NetworkUrls table. A public URL resolves to a fabric node close to the viewer
// rather than the node that happened to serve the (private, token-bound) playout URL.
const NETWORK_HOSTS: Record<string, string> = {
  main: "main.net955305.contentfabric.io",
  demo: "demov3.net955210.contentfabric.io",
  test: "test.net955203.contentfabric.io"
};

export interface OutputUrlRow {
  label: string;
  url: string;
  // DRM methods (e.g. Widevine): the license server URL. When present the UI shows
  // the playout + license URLs as sub-rows and leaves the parent row's URL blank.
  licenseServerUrl?: string;
  // Named-network variant of url/licenseServerUrl, authorized with an anonymous
  // (qspace_id-only) token instead of the stream's own channel-auth token.
  publicUrl?: string;
  publicLicenseServerUrl?: string;
}

export interface StreamOutputUrls {
  embedUrl?: string;
  playoutUrl?: string;
  publicPlayoutUrl?: string;
  playoutMethods: OutputUrlRow[];
}

class StreamStore {
  streams: StreamMap;
  // Streams with a live edge write token - the only ones polled for full status.
  // Rebuilt each poll by _ClassifyStreams; nudged by start/deactivate.
  activeStreamSlugs = new Set<string>();
  streamFrameUrls: Record<string, StreamFrameUrl> = {};
  showMonitorPreviews = false;
  loadingStatus = false;
  tableFilter = "";
  tableTagFilter: string[] = [];
  // Streams-page date filter (preset + anchor date). Persisted via SetDateFilter so
  // it isn't lost when the page unmounts on navigation. dateRangeFilter is derived.
  datePreset: DateRangePreset;
  referenceDate: Date;
  dateRangeFilter: [Date | null, Date | null];
  tenantLiveStreamContent: StreamMap = {};
  loadingTenantLiveStreamContent = false;
  // Full, unscoped stream set for the map-to-stream modal. Kept separate from `streams`
  // (the streams page's date-scoped list) so neither one clobbers the other.
  allStreams: StreamMap = {};
  allStreamsLoaded = false;
  loadingAllStreams = false;
  _allStreamsPromise: Promise<void> | null = null;
  // Paged tenant query state (streams page): whether another page is available,
  // whether a page fetch is in flight, and the resume cursor / query params.
  tenantContentHasMore = false;
  loadingMoreTenantContent = false;
  _tenantContentPromise: Promise<void> | null = null;
  _tenantContentFilterKey: string | null = null;
  _tenantContentCursor = 0;
  _tenantContentQuery: {siteId: string, dateRange?: [Date | null, Date | null], nameFilter?: string} | null = null;
  // Bumped whenever the paged tenant query is (re)started or the date filter changes.
  // In-flight "load more" fetches compare against it and discard stale results.
  _tenantContentEpoch = 0;
  // Bumped whenever `streams` is replaced (e.g. date-filter change). An in-flight
  // status/classify pass over the previous list checks this and stops early so it
  // doesn't keep hammering per-object metadata for streams no longer displayed.
  _streamListEpoch = 0;
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    const persisted = LoadPersistedDateFilter();
    this.datePreset = persisted.preset;
    this.referenceDate = persisted.referenceDate;
    this.dateRangeFilter = GetDateRangePreset(persisted.preset, persisted.referenceDate);

    makeAutoObservable(this, {
      _tenantContentPromise: false,
      _tenantContentFilterKey: false,
      _tenantContentCursor: false,
      _tenantContentQuery: false,
      _tenantContentEpoch: false,
      _streamListEpoch: false,
      _allStreamsPromise: false
    }, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  get streamsByObjectId(): {[k:string]: string} {
    return Object.fromEntries(
      Object.entries(this.streams || {}).map(([slug, s]) => [s.objectId, slug])
    );
  }

  get allTags(): string[] {
    const tags = new Set<string>();
    Object.values(this.streams || {}).forEach(s => s.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }

  get activeTagFilter(): string[] {
    const available = new Set(this.allTags);
    return this.tableTagFilter.filter(t => available.has(t));
  }

  /**
   * Tag filtering (always client-side) plus text filtering. Date scoping is server-side
   * (LoadTenantLiveStreamContent's date-tag filter) - streams carry no real createdAt to
   * filter on client-side. On the content-group path the text search is also server-side
   * (name:co: on the tenant query), so skip the client-side text match there and let the
   * re-queried list stand on its own.
   */
  get filteredStreams(): StreamInfo[] {
    const serverSideText = this.rootStore.dataStore.useContentGroup;
    const filter = serverSideText ? "" : this.tableFilter.toLowerCase();
    const tagFilter = this.activeTagFilter;
    return Object.values(this.streams || {}).filter(s => {
      const matchesText = !filter ||
        s.title?.toLowerCase().includes(filter) ||
        s.objectId?.toLowerCase().includes(filter);
      const matchesTags = tagFilter.length === 0 ||
        tagFilter.some(tag => s.tags?.includes(tag));
      return matchesText && matchesTags;
    });
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
    // Stop any in-flight status/classify pass over the previous list.
    this._streamListEpoch++;
    // Drop active slugs for streams no longer listed.
    this.activeStreamSlugs.forEach(slug => {
      if(!this.streams[slug]) { this.activeStreamSlugs.delete(slug); }
    });
    // The scoped list was (re)built or a stream was added/removed - the modal's full
    // set may now be stale, so refetch it the next time the modal opens.
    this.allStreamsLoaded = false;
    this._allStreamsPromise = null;
    const remaining = this.allTags;
    this.tableTagFilter = this.tableTagFilter.filter(t => remaining.includes(t));
  };

  SetTableFilter = (filter: string) => {
    this.tableFilter = filter;
  };

  SetTableTagFilter = (tags: string[]) => {
    this.tableTagFilter = tags;
    this.rootStore.userSettingsStore.Persist("tableFilters", {streams: tags});
  };

  RestoreTableTagFilter = (tags: string[]) => {
    this.tableTagFilter = tags;
  };

  /** Set the streams-page date filter and persist it (session-scoped) so it survives navigation. */
  SetDateFilter = ({preset, referenceDate}: {preset: DateRangePreset, referenceDate?: Date}) => {
    const ref = referenceDate ?? new Date();
    this.datePreset = preset;
    this.referenceDate = ref;
    this.dateRangeFilter = GetDateRangePreset(preset, ref);
    // Invalidate any in-flight paged "load more" from the previous range.
    this._tenantContentEpoch++;

    try {
      sessionStorage.setItem(STREAMS_DATE_FILTER_KEY, JSON.stringify({preset, referenceDate: ref.toISOString()}));
    } catch { /* sessionStorage unavailable - filter is still held in memory */ }
  };

  /**
   * Add/remove a slug from the active-poll set. On removal, `state` is written
   * straight to the stream since the poll skips it.
   */
  _SetStreamActive = ({slug, active, state}: {slug: string, active: boolean, state?: StreamStatus}) => {
    if(!slug) { return; }

    if(active) {
      this.activeStreamSlugs.add(slug);
    } else {
      this.activeStreamSlugs.delete(slug);
      if(state && this.streams?.[slug]) {
        this.UpdateStream({key: slug, value: {status: state}});
      }
    }
  };

  /**
   * Cheap classification from local metadata, mirroring client-js StreamStatus's
   * pre-bitcode branch: no url -> unconfigured; no fabric/playout/recording config
   * -> uninitialized; no edge write token -> inactive; else active. Updates
   * activeStreamSlugs, writes inactive states, and returns the slugs to poll.
   */
  *_ClassifyStreams({slugs, listEpoch}: {slugs: string[], listEpoch?: number}): Generator<any, string[]> {
    yield this.client.utils.LimitedMap(
      15,
      slugs,
      async (slug: string) => {
        // The list was replaced mid-pass - stop issuing per-object reads.
        if(listEpoch !== undefined && listEpoch !== this._streamListEpoch) { return; }
        const stream = this.streams?.[slug];
        if(!stream?.objectId) { return; }

        try {
          const libraryId = stream.libraryId ||
            await this.client.ContentObjectLibraryId({objectId: stream.objectId});

          const meta = await this.client.ContentObjectMetadata({
            libraryId,
            objectId: stream.objectId,
            select: [
              "live_recording_config/url",
              "live_recording/fabric_config/ingress_node_api",
              "live_recording/fabric_config/edge_write_token",
              "live_recording/playout_config",
              "live_recording/recording_config",
              "live_recording/status/edge_write_token"
            ]
          });

          const liveRecording = meta?.live_recording;
          const edgeWriteToken = liveRecording?.status?.edge_write_token ||
            liveRecording?.fabric_config?.edge_write_token;

          if(edgeWriteToken) {
            this._SetStreamActive({slug, active: true});
            return;
          }

          let state: StreamStatus;
          if(!meta?.live_recording_config?.url) {
            state = STATUS_MAP.UNCONFIGURED;
          } else if(
            !liveRecording?.fabric_config?.ingress_node_api ||
            !liveRecording?.playout_config ||
            !liveRecording?.recording_config
          ) {
            state = STATUS_MAP.UNINITIALIZED;
          } else {
            state = STATUS_MAP.INACTIVE;
          }

          this._SetStreamActive({slug, active: false, state});
        } catch(error) {
          // eslint-disable-next-line no-console
          console.error(`Unable to classify stream ${slug}`, error);
        }
      }
    );

    return slugs.filter(slug => this.activeStreamSlugs.has(slug));
  }

  *CheckStatus({
    objectId,
    slug,
    showParams=false,
    update=false
  }: {objectId: string, slug?: string, showParams?: boolean, update?: boolean}): Generator<any, void | {}> {
    let response;
    try {
      response = yield WithTimeout(
        this.client.StreamStatus({name: objectId, showParams}),
        STREAM_STATUS_TIMEOUT_MS,
        `StreamStatus(${objectId})`
      );
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

  /**
   * Classify streams from local metadata, then poll full status for the active
   * ones only. `slugs` limits the refresh (e.g. a newly-loaded page).
   */
  *AllStreamsStatus(reload=false, slugs: string[] | null = null): Generator<any, void> {
    if(this.loadingStatus && !reload) { return; }

    // Snapshot the list generation - bail if `streams` is replaced mid-run.
    const listEpoch = this._streamListEpoch;

    try {
      this.loadingStatus = true;

      const targetSlugs = slugs ?? Object.keys(this.streams || {});

      // Cheap pass: resolve inactive states locally, narrow the poll to active streams.
      const activeSlugs: string[] = yield this._ClassifyStreams({slugs: targetSlugs, listEpoch});

      if(listEpoch !== this._streamListEpoch) { return; }

      yield this.client.utils.LimitedMap(
        15,
        activeSlugs,
        async slug => {
          if(listEpoch !== this._streamListEpoch) { return; }
          const streamMeta = this.streams?.[slug];
          if(!streamMeta) { return; }
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

    // Write token exists now - start polling without waiting for the next classify pass.
    this._SetStreamActive({slug, active: true});

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

      // Edge write token is gone - stop polling this stream.
      this._SetStreamActive({slug, active: false});
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

  /** Run a TenantContent query pinned to the fixed fabric node, always releasing the region afterward. */
  async _TenantContent(params: Record<string, any>): Promise<any> {
    this.client.SetNodes({fabricURIs: [TENANT_CONTENT_NODE_URI]});
    try {
      return await this.client.TenantContent(params);
    } finally {
      try {
        await this.client.ResetRegion();
      } catch(error) {

        console.error("Unable to reset region after TenantContent", error);
      }
    }
  }

  /**
   * Build the TenantContent filter array for the given site + optional date range +
   * optional name search. `nameFilter` is matched against the `name` query field with
   * a contains match, so the streams-page search box narrows server-side rather
   * than only client-side.
   */
  _TenantContentFilter(siteId: string, dateRange?: [Date | null, Date | null], nameFilter?: string): string[] {
    const [startDate, endDate] = dateRange || [null, null];
    const filter = [`group:eq:${siteId}`];

    const name = (nameFilter || "").trim();
    if(name) { filter.push(`name:co:${name}`); }

    if(startDate && endDate && FormatDateFilter(startDate) === FormatDateFilter(endDate)) {
      // Single day - one exact-match tag rather than a redundant ge/le pair.
      filter.push(`tag:eq:${LIVE_STREAM_DATE_TAG_PREFIX}${FormatDateFilter(startDate)}`);
    } else if(startDate || endDate) {
      filter.push(`tag:co:${LIVE_STREAM_DATE_TAG_KEY}`);
      if(startDate) { filter.push(`tag:ge:${LIVE_STREAM_DATE_TAG_PREFIX}${FormatDateFilter(startDate)}`); }
      if(endDate) { filter.push(`tag:le:${LIVE_STREAM_DATE_TAG_PREFIX}${FormatDateFilter(endDate)}`); }
    }

    return filter;
  }

  /**
   * Start index of the next page, or null when none are left. The tenant query's
   * paging shape has varied (next / more / total), so fall back to "was this page full?".
   */
  _NextTenantPageStart({paging, start, received, limit}: {paging?: TenantContentPaging, start: number, received: number, limit: number}): number | null {
    const nextStart = start + limit;

    if(paging) {
      if(paging.next != null) { return paging.next > start ? paging.next : null; }
      if(paging.more === true) { return nextStart; }
      if(paging.more === false) { return null; }
      if(typeof paging.pages === "number" && limit > 0) {
        return Math.floor(start / limit) + 1 < paging.pages ? nextStart : null;
      }
      if(typeof paging.total === "number") { return nextStart < paging.total ? nextStart : null; }
    }

    return received >= limit && received > 0 ? nextStart : null;
  }

  /**
   * paged=true fetches only the first page and records a resume cursor; callers pull
   * further pages via LoadMoreTenantLiveStreamContent. paged=false (default) loops
   * through every page in one call.
   */
  *LoadTenantLiveStreamContent({siteId, dateRange, nameFilter, force=false, paged=false}: {siteId?: string, dateRange?: [Date | null, Date | null], nameFilter?: string, force?: boolean, paged?: boolean} = {}): Generator<any, StreamMap> {
    if(!siteId) {
      // No registered site id - skip the tenant query and let the caller fall back
      // to the site object's stream list.
      console.warn("LoadTenantLiveStreamContent: no siteId, skipping tenant query");
      this.tenantLiveStreamContent = {};
      this.tenantContentHasMore = false;
      return this.tenantLiveStreamContent;
    }

    const [startDate, endDate] = dateRange || [null, null];
    const name = (nameFilter || "").trim();
    const filterKey = JSON.stringify([
      siteId,
      startDate ? FormatDateFilter(startDate) : null,
      endDate ? FormatDateFilter(endDate) : null,
      name,
      paged
    ]);

    if(!force && this._tenantContentPromise && this._tenantContentFilterKey === filterKey) {
      yield this._tenantContentPromise;
      return this.tenantLiveStreamContent;
    }

    this._tenantContentFilterKey = filterKey;
    let resolve: () => void;
    this._tenantContentPromise = new Promise(res => { resolve = res; });
    this.loadingTenantLiveStreamContent = true;

    // Reset the accumulated set and paging cursor for this fresh query.
    this.tenantLiveStreamContent = {};
    this.tenantContentHasMore = false;
    this._tenantContentCursor = 0;
    this._tenantContentQuery = {siteId, dateRange, nameFilter: name};
    // Any "load more" still in flight from a prior query is now stale.
    this._tenantContentEpoch++;

    try {
      const filter = this._TenantContentFilter(siteId, dateRange, name);
      let start = 0;
      let versions: TenantContentVersion[] = [];

      while(true) {
        const {versions: page, paging} = yield this._TenantContent({
          filter,
          start,
          limit: TENANT_CONTENT_PAGE_SIZE,
          select: TENANT_CONTENT_SELECT
        });

        const received = (page ?? []).length;
        versions = versions.concat(page ?? []);

        const next = this._NextTenantPageStart({paging, start, received, limit: TENANT_CONTENT_PAGE_SIZE});

        if(paged) {
          // One page per call - remember where to resume and stop.
          this._tenantContentCursor = next ?? start;
          this.tenantContentHasMore = next !== null;
          break;
        }

        if(next === null) { break; }
        start = next;
      }

      this.tenantLiveStreamContent = Object.fromEntries(
        versions
          .filter(({id, hash}) => id && hash)
          .map(version => [version.id, StreamInfoFromTenantVersion(version) as StreamInfo])
      );
    } catch(error) {
      console.error("Unable to load tenant live stream content", error);
      this._tenantContentFilterKey = null;
    } finally {
      this.loadingTenantLiveStreamContent = false;
      resolve();
    }

    return this.tenantLiveStreamContent;
  }

  /**
   * Fetch the next page of the current paged tenant query, merge it into
   * tenantLiveStreamContent, and return only the newly-added entries.
   */
  *LoadMoreTenantLiveStreamContent(): Generator<any, StreamMap> {
    if(!this.tenantContentHasMore || this.loadingMoreTenantContent || !this._tenantContentQuery) {
      return {};
    }

    this.loadingMoreTenantContent = true;
    const added: StreamMap = {};
    const epoch = this._tenantContentEpoch;

    try {
      const {siteId, dateRange, nameFilter} = this._tenantContentQuery;
      const filter = this._TenantContentFilter(siteId, dateRange, nameFilter);
      const start = this._tenantContentCursor;

      const {versions, paging} = yield this._TenantContent({
        filter,
        start,
        limit: TENANT_CONTENT_PAGE_SIZE,
        select: TENANT_CONTENT_SELECT
      });

      // Query restarted while this page was in flight - drop stale rows.
      if(epoch !== this._tenantContentEpoch) { return {}; }

      const received = (versions ?? []).length;
      (versions ?? [])
        .filter(({id, hash}: TenantContentVersion) => id && hash && !this.tenantLiveStreamContent[id])
        .forEach((version: TenantContentVersion) => { added[version.id] = StreamInfoFromTenantVersion(version) as StreamInfo; });

      this.tenantLiveStreamContent = {...this.tenantLiveStreamContent, ...added};

      const next = this._NextTenantPageStart({paging, start, received, limit: TENANT_CONTENT_PAGE_SIZE});
      this._tenantContentCursor = next ?? start;
      this.tenantContentHasMore = next !== null;
    } catch(error) {
      console.error("Unable to load more tenant live stream content", error);
    } finally {
      this.loadingMoreTenantContent = false;
    }

    return added;
  }

  /**
   * Enrich a raw stream-metadata map with per-object data (decoded objectId,
   * libraryId, title, tags, source/packaging, inputCfg) and return it without
   * touching store state.
   *
   * fetchObjectData=false skips the per-object metadata fetch, keeping only what's
   * in the map plus the decoded objectId - used for the tenant content-group query,
   * whose list data is loaded separately.
   */
  *_EnrichStreams({streamMetadata, fetchObjectData=true}: {streamMetadata: StreamMap, fetchObjectData?: boolean}): Generator<any, StreamMap> {
    const enriched: StreamMap = {};

    Object.keys(streamMetadata).forEach(slug => {
      const stream = streamMetadata[slug];

      let versionHash = stream?.["."]?.source ?? stream.versionHash;

      if(!versionHash) {
        try {
          const match = stream?.["/"]?.match(/(hq__[^/]+)/);
          versionHash = match ? match[1] : undefined;
        } catch { /* skip */ }
      }

      if(!versionHash) {
        console.error(`No version hash for ${slug}`);
        return;
      }

      let objectId: string;
      try {
        objectId = this.client.utils.DecodeVersionHash(versionHash).objectId;
      } catch(error) {
        console.error(`Failed to decode version hash for ${slug}`, error);
        return;
      }

      enriched[slug] = {...stream, slug, objectId, versionHash};
    });

    if(!fetchObjectData) { return enriched; }

    yield this.client.utils.LimitedMap(
      10,
      Object.keys(enriched),
      async slug => {
        const {objectId, versionHash} = enriched[slug];
        if(!objectId) { return; }

        try {
          const libraryId = await WithTimeout(
            this.client.ContentObjectLibraryId({objectId}) as Promise<string>,
            OBJECT_LOOKUP_TIMEOUT_MS,
            `ContentObjectLibraryId(${objectId})`
          );

          enriched[slug].libraryId = libraryId;

          const streamDetails = await WithTimeout(
            this.LoadStreamListData({objectId, libraryId}) as unknown as Promise<StreamListData | undefined>,
            OBJECT_LOOKUP_TIMEOUT_MS,
            `LoadStreamListData(${objectId})`
          ) || {};

          // Query-field name is the fallback title when the metadata fetch returns none.
          const queryFieldName = enriched[slug].name;
          Object.assign(enriched[slug], streamDetails);
          enriched[slug].title = enriched[slug].title || queryFieldName;
        } catch(error) {
          console.error(`Failed to load stream ${slug} (${versionHash})`, error);
        }
      }
    );

    return enriched;
  }

  /**
   * append=true merges into the existing scoped list (additional pages); otherwise
   * replaces it. fetchObjectData=false skips per-object metadata fetches (see _EnrichStreams).
   */
  *LoadStreams({streamMetadata, append=false, fetchObjectData=true}: {streamMetadata: StreamMap, append?: boolean, fetchObjectData?: boolean}): Generator<any, void> {
    const enriched: StreamMap = yield this._EnrichStreams({streamMetadata, fetchObjectData});
    this.UpdateStreams({streams: append ? {...this.streams, ...enriched} : enriched});
    this.rootStore.streamGroupStore.BuildGroups(this.streams);
  }

  /**
   * Load the full, unscoped stream set for the map-to-stream modal. Kept independent
   * of the streams page's date-scoped query so neither list clobbers the other. No
   * status polling - the modal only needs inputCfg / title / objectId to pick a stream.
   */
  *LoadAllStreams({force=false}: {force?: boolean} = {}): Generator<any, StreamMap> {
    if(this.allStreamsLoaded && !force) { return this.allStreams; }
    if(this._allStreamsPromise && !force) {
      yield this._allStreamsPromise;
      return this.allStreams;
    }

    let resolve: () => void;
    this._allStreamsPromise = new Promise(res => { resolve = res; });
    this.loadingAllStreams = true;

    try {
      const siteId = this.rootStore.dataStore.siteId;
      let streamMetadata: StreamMap = {};

      if(siteId && this.rootStore.dataStore.useContentGroup) {
        const filter = this._TenantContentFilter(siteId); // no date range - full set
        let start = 0;
        let versions: TenantContentVersion[] = [];

        while(true) {
          const {versions: page, paging} = yield this._TenantContent({
            filter,
            start,
            limit: TENANT_CONTENT_PAGE_SIZE
          });

          const received = (page ?? []).length;
          versions = versions.concat(page ?? []);

          const next = this._NextTenantPageStart({paging, start, received, limit: TENANT_CONTENT_PAGE_SIZE});
          if(next === null) { break; }
          start = next;
        }

        streamMetadata = Object.fromEntries(
          versions
            .filter(({id, hash}) => id && hash)
            .map(version => [version.id, StreamInfoFromTenantVersion(version) as StreamInfo])
        );
      }

      // Legacy sites (no content-group query) use the site object's registered list.
      if(!this.rootStore.dataStore.useContentGroup) {
        streamMetadata = yield this.rootStore.dataStore.LoadTenantSiteStreams();
      }

      // Full per-object enrichment here on purpose: the map-to-stream modal needs
      // inputCfg / source / packaging to pick a stream, and it's opened on demand.
      this.allStreams = yield this._EnrichStreams({streamMetadata});
      this.allStreamsLoaded = true;
    } catch(error) {
      console.error("Unable to load all streams", error);
      this._allStreamsPromise = null;
    } finally {
      this.loadingAllStreams = false;
      resolve();
    }

    return this.allStreams;
  }

  /**
   * Load and enrich only the streams in one group (query_fields.title_id). The tenant
   * query only narrows by site + date tag, so version metadata is still paged in full,
   * but per-object enrichment runs for the group's streams alone. Returns the map
   * without touching store state.
   *
   * TODO: use a server-side title_id filter once the group-data source lands.
   */
  *LoadStreamsByTitleId(titleId: string): Generator<any, StreamMap> {
    const siteId = this.rootStore.dataStore.siteId;
    if(!siteId || !titleId) { return {}; }

    const filter = this._TenantContentFilter(siteId);
    let start = 0;
    let versions: TenantContentVersion[] = [];

    while(true) {
      const {versions: page, paging} = yield this._TenantContent({
        filter,
        start,
        limit: TENANT_CONTENT_PAGE_SIZE
      });

      const received = (page ?? []).length;
      versions = versions.concat(page ?? []);

      const next = this._NextTenantPageStart({paging, start, received, limit: TENANT_CONTENT_PAGE_SIZE});
      if(next === null) { break; }
      start = next;
    }

    const streamMetadata: StreamMap = Object.fromEntries(
      versions
        .filter(({id, hash}) => id && hash)
        .map(version => [version.id, StreamInfoFromTenantVersion(version) as StreamInfo])
        .filter(([, info]) => (info as StreamInfo).titleId === titleId)
    );

    return yield this._EnrichStreams({streamMetadata});
  }

  /**
   * Fetch live status for the given objectIds, keyed by objectId. Pure - writes to no
   * store map, so callers holding a local stream list can merge it themselves.
   */
  *StreamStatuses(objectIds: string[]): Generator<any, Record<string, Partial<StreamInfo>>> {
    const result: Record<string, Partial<StreamInfo>> = {};

    yield this.client.utils.LimitedMap(
      15,
      objectIds || [],
      async (objectId: string) => {
        if(!objectId) { return; }

        try {
          const response = await this.CheckStatus({objectId}) as any;
          result[objectId] = {
            status: response?.state,
            warnings: response?.warnings,
            quality: response?.quality,
            embedUrl: response?.playoutUrls?.embedUrl
          };
        } catch(error) {

          console.error(`Skipping status for ${objectId}.`, error);
        }
      }
    );

    return result;
  }

  /**
   * Build the output URLs for one stream: the embeddable URL, the offering options
   * URL, and one playout URL per available protocol/DRM method (e.g. "HLS Clear",
   * "Dash Widevine"). All playout URLs carry the same week-long signed token.
   */
  *BuildStreamOutputUrls(objectId: string): Generator<any, StreamOutputUrls> {
    const result: StreamOutputUrls = {playoutMethods: []};
    if(!objectId) { return result; }

    const versionHash = yield this.client.LatestVersionHash({objectId});
    const anonymousToken = this.client.utils.B64(
      JSON.stringify({qspace_id: this.rootStore.contentSpaceId})
    );

    let signedToken;
    try {
      signedToken = yield this.client.CreateSignedToken({
        objectId,
        subject: "elv-lsm",
        duration: 7 * 86400000 // 1 week
      });
    } catch(error) {

      console.error(`Unable to create signed token for ${objectId}`, error);
    }

    // Swap channel auth for the signed token when we have one
    const authArgs = signedToken ?
      {noAuth: true, queryParams: {authorization: signedToken}} :
      {channelAuth: true};

    try {
      result.embedUrl = yield this.EmbedUrl({objectId});
    } catch(error) {

      console.error(`Unable to load embed URL for ${objectId}`, error);
    }

    let libraryId;
    try {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
      const rawPlayoutUrl = yield this.client.FabricUrl({
        libraryId,
        objectId,
        rep: "playout/default/options.json",
        ...authArgs
      });
      result.playoutUrl = this._NamedNetworkUrl({url: rawPlayoutUrl, versionHash});
      result.publicPlayoutUrl = this._NamedNetworkUrl({url: rawPlayoutUrl, versionHash, dropAuthorization: true});
    } catch(error) {

      console.error(`Unable to load playout options URL for ${objectId}`, error);
    }

    // Configured playout formats, in the precedence order the stream details page uses
    // (overrides -> config -> applied -> keys of the applied "default" offering).
    let formats: string[] = [];
    try {
      const [overrides, config, applied, offering] = yield Promise.all([
        this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: "live_recording_overrides/playout_config/playout_formats"}),
        this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: "live_recording_config/playout_config/playout_formats"}),
        this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: "live_recording/playout_config/playout_formats"}),
        this.client.ContentObjectMetadata({libraryId, objectId, metadataSubtree: "offerings/default/playout/playout_formats"})
      ]);
      const configured = overrides ?? config ?? applied ?? Object.keys(offering || {});
      formats = (Array.isArray(configured) ? configured : []).filter(format => PLAYOUT_FORMATS[format]);
    } catch(error) {

      console.error(`Unable to load playout formats for ${objectId}`, error);
    }

    // License servers only exist for a running stream; when PlayoutOptions fails
    // (no finalized offering yet) the deterministic playout URLs below still stand.
    const liveMethods: Record<string, any> = {};
    try {
      const playoutOptions = yield this.client.PlayoutOptions({
        objectId,
        protocols: ["hls", "dash"],
        drms: ALL_DRMS,
        offering: "default"
      });
      Object.keys(playoutOptions || {}).forEach(protocol => {
        Object.keys(playoutOptions[protocol]?.playoutMethods || {}).forEach(drm => {
          liveMethods[`${protocol}-${drm}`] = playoutOptions[protocol].playoutMethods[drm];
        });
      });
    } catch(error) {

      console.error(`Unable to load live playout options for ${objectId}`, error);
    }

    for(const format of formats) {
      const {label, manifest, protocol, drm} = PLAYOUT_FORMATS[format];

      let rawUrl;
      try {
        rawUrl = yield this.client.FabricUrl({
          libraryId,
          objectId,
          rep: `playout/default/${format}/${manifest}`,
          ...authArgs
        });
      } catch(error) {

        console.error(`Unable to build playout URL for ${objectId} (${format})`, error);
        continue;
      }

      const licenseServers = liveMethods[`${protocol}-${drm}`]?.drms?.[drm]?.licenseServers;
      const licenseServerUrl = Array.isArray(licenseServers) && licenseServers.length > 0 ? licenseServers[0] : undefined;

      result.playoutMethods.push({
        label,
        url: this._NamedNetworkUrl({url: rawUrl, versionHash}),
        licenseServerUrl,
        publicUrl: this._NamedNetworkUrl({url: rawUrl, versionHash, dropAuthorization: true}),
        publicLicenseServerUrl: licenseServerUrl ?
          this._PublicLicenseServerUrl({url: licenseServerUrl, versionHash, authorizationToken: anonymousToken}) :
          undefined
      });
    }

    return result;
  }

  /**
   * Rebuild a fabric URL against a named-network host instead of the specific node
   * that served the original, so the link resolves close to whichever viewer opens it.
   * dropAuthorization strips the auth token for the "public" variant; omitted, the
   * URL's own token is kept.
   */
  _NamedNetworkUrl({url, versionHash, dropAuthorization=false}: {url: string, versionHash: string, dropAuthorization?: boolean}): string | undefined {
    try {
      const network = this.rootStore.networkInfo?.name || "main";
      const networkHost = NETWORK_HOSTS[network] || NETWORK_HOSTS.main;

      const originalUrl = new URL(url);
      let path = UrlJoin("rep", originalUrl.pathname.split("/rep")[1] || "");
      if(originalUrl.pathname.includes("/meta")) {
        path = UrlJoin("meta", originalUrl.pathname.split("/meta")[1]);
      }

      const namedNetworkUrl = new URL(`https://${networkHost}`);
      namedNetworkUrl.pathname = UrlJoin("s", network, "q", versionHash, path);
      originalUrl.searchParams.forEach((value, key) => {
        if(key !== "authorization") { namedNetworkUrl.searchParams.set(key, value); }
      });
      if(!dropAuthorization) {
        namedNetworkUrl.searchParams.set("authorization", originalUrl.searchParams.get("authorization") || "");
      }

      return namedNetworkUrl.toString();
    } catch(error) {

      console.error(`Unable to build named-network URL for ${url}`, error);
      return undefined;
    }
  }

  /**
   * License servers are a separate DRM proxy service, not a fabric node - keep their
   * host/path as-is and just swap the auth token (plus qhash, which the proxy needs
   * to look up the object).
   */
  _PublicLicenseServerUrl({url, versionHash, authorizationToken}: {url: string, versionHash: string, authorizationToken: string}): string | undefined {
    try {
      const licenseServerUrl = new URL(url);
      licenseServerUrl.searchParams.set("qhash", versionHash);
      licenseServerUrl.searchParams.set("authorization", authorizationToken);

      return licenseServerUrl.toString();
    } catch(error) {

      console.error(`Unable to build public license server URL for ${url}`, error);
      return undefined;
    }
  }

  /** Output URLs for several streams, keyed by objectId. Pure - returned to the caller. */
  *StreamOutputUrls(objectIds: string[]): Generator<any, Record<string, StreamOutputUrls>> {
    const result: Record<string, StreamOutputUrls> = {};

    yield this.client.utils.LimitedMap(
      5,
      objectIds || [],
      async (objectId: string) => {
        if(!objectId) { return; }
        result[objectId] = await this.BuildStreamOutputUrls(objectId) as unknown as StreamOutputUrls;
      }
    );

    return result;
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
          "public/asset_metadata/display_title",
          "public/asset_metadata/tags",
          "live_recording/recording_config/recording_params/xc_params/input_cfg",
          "live_recording_config/url",
          "live_recording_config/recording_config/input_cfg"
        ]
      });

      return StreamListDataFromMeta(meta);
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

      this.UpdateStream({
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
        audioData
      };
    } catch(error) {

      console.error("Unable to load live_recording metadata", error);
      return {audioStreams: [], audioData: {}};
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
