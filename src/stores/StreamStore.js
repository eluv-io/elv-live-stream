// Force strict mode so mutations are only allowed within actions.
import {configure, flow, makeAutoObservable} from "mobx";
import {editStore} from "./index";
import UrlJoin from "url-join";
import {dataStore} from "./index";
import {StreamIsActive} from "Stores/helpers/Misc";

configure({
  enforceActions: "always"
});

// Store for all stream-related actions
class StreamStore {
  streams;
  streamFrameUrls = {};
  showMonitorPreviews = false;
  loadingStatus = false;

  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }

  ToggleMonitorPreviews() {
    this.showMonitorPreviews = !this.showMonitorPreviews;
  }

  UpdateStream = ({key, value={}}) => {
    this.streams[key] = {
      ...(this.streams[key] || {}),
      ...value,
      slug: key
    };
  };

  UpdateStreams = ({streams}) => {
    this.streams = streams;
  };

  ConfigureStream = flow(function * ({
    objectId,
    slug
  }) {
    const liveRecordingConfig = yield this.client.ContentObjectMetadata({
      libraryId: yield this.client.ContentObjectLibraryId({objectId}),
      objectId,
      metadataSubtree: "live_recording_config",
      select: [
        "input/audio/stream_index",
        "input/audio/stream",
        "output/audio/bitrate",
        "output/audio/channel_layout",
        "part_ttl"
      ]
    });
    const customSettings = {};

    if(liveRecordingConfig.input?.audio?.stream === "specific") {
      customSettings["audioIndex"] = liveRecordingConfig.input?.audio?.stream_index;
      customSettings["audioBitrate"] = liveRecordingConfig?.output?.audio?.bitrate;
      customSettings["partTtl"] = liveRecordingConfig?.part_ttl;
      customSettings["channelLayout"] = liveRecordingConfig?.output?.audio?.channel_layout;
    }

    yield this.client.StreamConfig({name: objectId, customSettings});

    // Update stream link in site after stream configuration
    yield editStore.UpdateStreamLink({objectId, slug});

    const response = yield this.CheckStatus({
      objectId
    });

    const streamDetails = yield dataStore.LoadStreamMetadata({
      objectId
    });

    this.UpdateStream({
      key: slug,
      value: {
        status: response.state,
        ...streamDetails
      }
    });
  });

  CheckStatus = flow(function * ({
    objectId,
    stopLro=false,
    showParams=false
  }) {
    return yield this.client.StreamStatus({
      name: objectId,
      stopLro,
      showParams
    });
  });

  StartStream = flow(function * ({
    slug,
    start=false
  }) {
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
        // Already started - nothing to do
        return;
    }

    const edgeWriteToken = response.edge_write_token;

    let tokenMeta;

    if(edgeWriteToken) {
      tokenMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/status/edge_write_token"
      });
    }

    if(!tokenMeta || tokenMeta !== edgeWriteToken) {
      yield this.client.StreamCreate({name: objectId, start});
    }

    yield this.OperateLRO({
      objectId,
      slug,
      operation: "START"
    });
  });

  OperateLRO = flow(function * ({
    objectId,
    slug,
    operation
  }) {
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

      this.UpdateStream({key: slug, value: { status: response.state }});

      dataStore.UpdateStreamUrl({
        key: response.reference_url,
        value: {
          active: StreamIsActive(response.state)
        }
      });
    } catch(error) {
      console.error(`Unable to ${OP_MAP[operation]} LRO.`, error);
    }
  });

  DeactivateStream = flow(function * ({objectId, slug}) {
    try {
      const response = yield this.client.StreamStopSession({name: objectId});

      this.UpdateStream({key: slug, value: { status: response.state }});
      const streamMeta = this.streams[slug];
      const key = streamMeta?.referenceUrl || streamMeta?.originUrl;

      dataStore.UpdateStreamUrl({
        key,
        value: {
          active: StreamIsActive(response.state)
        }
      });
    } catch(error) {
      console.error("Unable to deactivate stream", error);
    }
  })

  AllStreamsStatus = flow(function * ({urls}={}) {
    if(this.loadingStatus) { return; }

    try {
      this.loadingStatus = true;

      yield this.client.utils.LimitedMap(
        15,
        Object.keys(this.streams || {}),
        async slug => {
          try {
            const streamMeta = this.streams[slug];
            const response = await this.CheckStatus({
              objectId: streamMeta.objectId
            });

            this.UpdateStream({
              key: slug,
              value: {
                status: response.state,
                embedUrl: response?.playout_urls?.embed_url
              }
            });

            if(urls) {
              const key = streamMeta?.referenceUrl || streamMeta?.originUrl;

              if(Object.hasOwn(urls, key)) {
                urls[key].active = StreamIsActive(response.state);
              }
            }
          } catch(error) {
            console.error(`Failed to load status for ${this.streams[slug].objectId}.`, error);
          }
        }
      );

      if(urls) {
        dataStore.UpdateStreamUrls({urls});
      }
    } catch(error) {
      console.error(error);
    } finally {
      this.loadingStatus = false;
    }
  });

  async FetchVideoPath(stream, playlistPath) {
    const [path, params] = playlistPath.split("?");
    const searchParams = new URLSearchParams(params);
    searchParams.delete("authorization");

    const url = new URL(
      await this.client.FabricUrl({
        libraryId: await this.client.ContentObjectLibraryId({objectId: stream.objectId}),
        objectId: stream.objectId,
        rep: UrlJoin("/playout/default/hls-clear", path),
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

  FetchStreamFrameURL = flow(function * (slug) {
    console.time(`Load Frame: ${slug}`);
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
      console.error("Error fetching frame for " + slug);
      console.error(error);
      return;
    } finally {
      console.timeEnd(`Load Frame: ${slug}`);
    }
  });

  StreamFrameURL = flow(function * (slug) {
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
      // URL not found - remove cache
      delete this.streamFrameUrls[slug];
    }

    return url;
  })
}

export default StreamStore;
