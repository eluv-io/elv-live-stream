// Loaded streams and their runtime state: the streams map, status polling, live control (start/stop/restart/deactivate), and monitor frame previews.
import {makeAutoObservable} from "mobx";
import UrlJoin from "url-join";
import {WithTimeout} from "@/utils/helpers";
import {STATUS_MAP, type StreamStatus} from "@/utils/constants";
import type RootStore from "@/stores/RootStore";
import {StreamInfo} from "@/stores/DataStore";
import {StreamOp} from "@/stores/streams/StreamModalStore";

interface StreamFrameUrl {
  timestamp: number;
  promise: Generator<any, string | undefined> | Promise<unknown>;
  url?: string;
}

type StreamMap = Record<string, StreamInfo>;

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
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeAutoObservable(this, {_streamListEpoch: false}, {autoBind: true});
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
   * Cheap classification from local metadata, mirroring client-js StreamStatus's
   * pre-bitcode branch: no url -> unconfigured; missing fabric/playout/recording config
   * -> uninitialized; no edge write token -> inactive; else active. Returns the slugs to poll.
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

      this.SetStream({
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
            quality: response?.quality,
            embedUrl: response?.playoutUrls?.embedUrl
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
