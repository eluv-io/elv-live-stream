// Loaded streams and their runtime state: the streams map, status polling, live control (start/stop/restart/deactivate), and monitor frame previews.
import {makeAutoObservable} from "mobx";
import UrlJoin from "url-join";
import {WithTimeout} from "@/utils/helpers";
import {type StreamStatus} from "@/utils/constants";
import type RootStore from "@/stores/RootStore";
import {StreamInfo} from "@/stores/TenantStore";
import {LOCAL_STATE_SELECT, LocalStateFromMeta} from "@/stores/lib/tenantContent";
import {StreamOp} from "@/stores/streams/StreamModalStore";

interface StreamFrameUrl {
  timestamp: number;
  promise: Generator<any, string | undefined> | Promise<unknown>;
  url?: string;
}

type StreamMap = Record<string, StreamInfo>;

type LocalState = Awaited<ReturnType<StreamStatusStore["_ReadLocalState"]>>;

const STREAM_STATUS_TIMEOUT_MS = 10000;

class StreamStatusStore {
  streams: StreamMap;
  // Streams with a live edge write token - the only ones polled for full status.
  // Rebuilt each poll by _ClassifyStreams.
  activeStreamSlugs = new Set<string>();
  streamFrameUrls: Record<string, StreamFrameUrl> = {};
  showMonitorPreviews = false;
  loadingStatus = false;
  // Bumped whenever `streams` is replaced; an in-flight status/classify pass checks this and stops early.
  _streamListEpoch = 0;
  // Local reads from the latest classify pass, so the follow-up poll skips a second metadata read.
  _localStates = new Map<string, LocalState>();
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeAutoObservable(this, {_streamListEpoch: false, _localStates: false}, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  get streamsByObjectId(): {[k:string]: string} {
    return Object.fromEntries(
      Object.entries(this.streams || {}).map(([slug, s]) => [s.objectId, slug])
    );
  }

  ToggleMonitorPreviews() {
    this.showMonitorPreviews = !this.showMonitorPreviews;
  }

  SetStream = ({key, value={}}: {key: string, value?: Partial<StreamInfo>}) => {
    if(!key) { return; }

    this.streams[key] = {
      ...(this.streams[key] || {}),
      ...value,
      slug: key
    } as StreamInfo;
  };

  // Called only by StreamListStore.SetStreams (underscore = not for components), which also prunes list state.
  _ReplaceStreams = ({streams}: {streams: StreamMap}) => {
    this.streams = streams;
    // Stop any in-flight status/classify pass over the previous list.
    this._streamListEpoch++;
    // Drop active slugs for streams no longer listed.
    this.activeStreamSlugs.forEach(slug => {
      if(!this.streams[slug]) { this.activeStreamSlugs.delete(slug); }
    });
  };

  /** Add/remove a slug from the active-poll set. On removal, `state` is written straight to the stream. */
  _SetStreamActive = ({slug, active, state}: {slug: string, active: boolean, state?: StreamStatus}) => {
    if(!slug) { return; }

    if(active) {
      this.activeStreamSlugs.add(slug);
    } else {
      this.activeStreamSlugs.delete(slug);
      if(state && this.streams?.[slug]) {
        this.SetStream({key: slug, value: {status: state}});
      }
    }
  };

  /**
   * Local state for an object. A content-group stream's first read uses the state cached from the tenant
   * query; every other read (later polls, legacy list, objects outside the map) reads metadata.
   */
  async _ReadLocalState({objectId, libraryId}: {objectId: string, libraryId?: string}): Promise<{
    libraryId: string,
    mainMeta?: Record<string, any>,
    state?: StreamStatus,
    edgeWriteToken?: string
  }> {
    const stream = this._StreamByObjectId(objectId);
    libraryId = libraryId || stream?.libraryId || await this.client.ContentObjectLibraryId({objectId});

    if(stream?.queryMainMeta) {
      const mainMeta = stream.queryMainMeta;
      // First read only - the query data goes stale after start/stop, so later reads hit the fabric.
      this.SetStream({key: stream.slug, value: {queryMainMeta: undefined}});
      return {libraryId, mainMeta, ...LocalStateFromMeta(mainMeta)};
    }

    const meta = await this.client.ContentObjectMetadata({libraryId, objectId, select: LOCAL_STATE_SELECT});

    return {libraryId, mainMeta: meta, ...LocalStateFromMeta(meta)};
  }

  _StreamByObjectId(objectId: string): StreamInfo | undefined {
    return Object.values(this.streams || {}).find(stream => stream.objectId === objectId);
  }

  /** Classify streams from local metadata. Returns the slugs to poll. */
  *_ClassifyStreams({slugs, listEpoch}: {slugs: string[], listEpoch?: number}): Generator<any, string[]> {
    yield this.client.utils.LimitedMap(
      15,
      slugs,
      async (slug: string) => {
        // The list was replaced mid-pass - stop issuing per-object reads.
        if(listEpoch !== undefined && listEpoch !== this._streamListEpoch) { return; }
        const stream = this.streams?.[slug];
        if(!stream?.objectId) { return; }

        // Content-group streams are classified once from the tenant query; later passes keep that
        // classification (active ones keep polling StreamStatus) rather than re-reading metadata.
        if(
          this.rootStore.settingsStore.useContentGroup &&
          !stream.queryMainMeta &&
          (stream.status || this.activeStreamSlugs.has(slug))
        ) { return; }

        try {
          const localState = await this._ReadLocalState({
            objectId: stream.objectId,
            libraryId: stream.libraryId
          });

          if(localState.edgeWriteToken) {
            this._localStates.set(slug, localState);
          } else {
            this._localStates.delete(slug);
          }

          this._SetStreamActive({slug, active: !!localState.edgeWriteToken, state: localState.state});
        } catch(error) {
          // eslint-disable-next-line no-console
          console.error(`Unable to classify stream ${slug}`, error);
        }
      }
    );

    return slugs.filter(slug => this.activeStreamSlugs.has(slug));
  }

  // includeRecordingInfo / includeParams are for the details page only - they add an edge-metadata read.
  *CheckStatus({
    objectId,
    slug,
    update=false,
    localState,
    includeRecordingInfo=false,
    includeParams=false
  }: {
    objectId: string,
    slug?: string,
    update?: boolean,
    localState?: LocalState,
    includeRecordingInfo?: boolean,
    includeParams?: boolean
  }): Generator<any, void | {}> {
    let response: any;
    try {
      response = yield WithTimeout(
        this._FetchStatus({objectId, localState, includeRecordingInfo, includeParams}),
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

      this.SetStream({
        key: slug,
        value: {
          status: response.state,
          warnings: response.warnings,
          quality: response.quality
        }
      });
    }

    return response;
  }

  async _FetchStatus({objectId, localState, includeRecordingInfo, includeParams}: {
    objectId: string,
    localState?: LocalState,
    includeRecordingInfo: boolean,
    includeParams: boolean
  }): Promise<any> {
    const {libraryId, mainMeta} = localState ?? await this._ReadLocalState({objectId});

    // With mainMeta, StreamStatus resolves unconfigured/uninitialized/inactive without a fabric call.
    return await this.client.StreamStatus({name: objectId, libraryId, mainMeta, includeRecordingInfo, includeParams});
  }

  /**
   * Classify streams from local metadata, then poll full status for the active
   * ones only. `slugs` limits the refresh (e.g. a newly-loaded page).
   */
  *LoadAllStreamsStatus(reload=false, slugs: string[] | null = null): Generator<any, void> {
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
              update: true,
              localState: this._localStates.get(slug)
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

  // objectId overrides the slug lookup for streams outside the streams map (alternate transcodes).
  *StartStream({
    slug,
    objectId=this.streams[slug]?.objectId,
    start=false
  }: {slug?: string, objectId?: string, start?: boolean}): Generator<any, void> {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});

    const response = yield this.CheckStatus({objectId});
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

    // Write token exists now - start polling immediately.
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

      this.SetStream({key: slug, value: { status: response.state }});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to ${OP_MAP[operation]} LRO.`, error);
      throw error;
    }
  }

  *RestartRecording({objectId, slug}: {objectId: string, slug: string}): Generator<any, void> {
    try {
      const response = yield this.client.StreamRestartRecording({name: objectId});

      if(response?.error) {
        throw new Error(response.error);
      }

      // New edge write token - keep polling the fresh session.
      this._SetStreamActive({slug, active: true});
      this.SetStream({key: slug, value: {status: response.state}});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to restart stream recording", error);
      throw error;
    }
  }

  *DeactivateStream({objectId, slug}: {objectId: string, slug: string}): Generator<any, void> {
    try {
      const response = yield this.client.StreamStopRecording({name: objectId});

      if(!response) { return; }

      // Edge write token is gone - stop polling this stream.
      this._SetStreamActive({slug, active: false});
      this.SetStream({key: slug, value: { status: response.state }});
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

  *_LoadStreamFrameUrl(slug: string): Generator<any, string> {
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
      // eslint-disable-next-line no-console
      console.error("Error fetching frame for " + slug, error);
      return;
    } finally {
      // eslint-disable-next-line no-console
      console.timeEnd(`Load Frame: ${slug}`);
    }
  }

  *LoadStreamFrameUrl(slug: string): Generator<any, string | undefined> {
    const existingUrl = this.streamFrameUrls[slug];

    if(existingUrl && Date.now() - existingUrl.timestamp < 60000) {
      return yield existingUrl.url;
    } else if(existingUrl) {
      URL.revokeObjectURL(yield existingUrl.url);
    }

    this.streamFrameUrls[slug] = {
      timestamp: Date.now(),
      promise: this._LoadStreamFrameUrl(slug)
    };

    const url = yield this.streamFrameUrls[slug].promise;

    if(!url) {
      delete this.streamFrameUrls[slug];
    }

    return url;
  }

  /** Live status for the given objectIds, keyed by objectId. Pure - writes to no store map. */
  *FetchStreamStatuses(objectIds: string[]): Generator<any, Record<string, Partial<StreamInfo>>> {
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
            quality: response?.quality
          };
        } catch(error) {
          // eslint-disable-next-line no-console
          console.error(`Skipping status for ${objectId}.`, error);
        }
      }
    );

    return result;
  }
}

export default StreamStatusStore;
