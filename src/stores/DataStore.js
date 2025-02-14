// Force strict mode so mutations are only allowed within actions.
import {configure, flow, makeAutoObservable, runInAction} from "mobx";
import {streamStore} from "./index";
import {RECORDING_BITRATE_OPTIONS} from "@/utils/constants";

configure({
  enforceActions: "always"
});

// Store for loading all the initial data
class DataStore {
  rootStore;
  tenantId;
  libraries;
  accessGroups;
  contentType;
  titleContentType;
  siteId;
  siteLibraryId;
  liveStreamUrls;
  ladderProfiles;

  constructor(rootStore) {
    makeAutoObservable(this);

    runInAction(() => {
      this.rootStore = rootStore;
    });
  }

  get client() {
    return this.rootStore.client;
  }

  Initialize = flow(function * (reload=false) {
    const tenantContractId = yield this.LoadTenantInfo();
    if(!this.siteId) {
      this.siteId = yield this.LoadTenantData({tenantContractId});
    }

    if(!this.siteLibraryId) {
      this.siteLibraryId = yield this.client.ContentObjectLibraryId({objectId: this.siteId});
    }

    yield this.LoadLadderProfiles();
    yield this.LoadStreams();
    yield streamStore.AllStreamsStatus(reload);
  });

  LoadTenantInfo = flow(function * () {
    try {
      if(!this.tenantId) {
        const wallet = yield this.client.userProfileClient.UserWalletObjectInfo();
        let tenantId = yield this.client.userProfileClient.TenantContractId();

        if(!tenantId) {
          tenantId = yield this.client.ContentObjectMetadata({
            libraryId: yield this.client.ContentObjectLibraryId({objectId: wallet.objectId}),
            objectId: wallet.objectId,
            metadataSubtree: "tenantContractId",
          });
        }

        this.tenantId = tenantId;

        if(!this.tenantId) {
          throw "Tenant ID not found";
        }
      }

      return this.tenantId;
    } catch(error) {
      this.rootStore.SetErrorMessage("Error: Unable to determine tenant info");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error("No tenant contract ID found.");
    }
  });

  LoadTenantData = flow(function * ({tenantContractId}) {
    try {
      const response = yield this.client.ContentObjectMetadata({
        libraryId: tenantContractId.replace("iten", "ilib"),
        objectId: tenantContractId.replace("iten", "iq__"),
        metadataSubtree: "public",
        select: [
          "sites/live_streams",
          "content_types/live_stream",
          "content_types/title"
        ]
      });
      const {sites, content_types} = response;

      if(content_types?.live_stream) {
        this.contentType = content_types.live_stream;
      }

      if(content_types?.title) {
        this.titleContentType = content_types.title;
      }

      return sites?.live_streams;
    } catch(error) {
      this.rootStore.SetErrorMessage("Error: Unable to load tenant sites");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error(`Unable to load sites for tenant ${tenantContractId}.`);
    }
  });

  LoadLadderProfiles = flow(function * () {
    try {
      const profiles = yield this.client.ContentObjectMetadata({
        libraryId: yield this.client.ContentObjectLibraryId({objectId: this.siteId}),
        objectId: this.siteId,
        metadataSubtree: "public/asset_metadata/profiles"
      });

      this.UpdateLadderProfiles({profiles});

      return profiles;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load ladder profiles from site object", error);
    }
  });

  LoadStreams = flow(function * () {
    streamStore.UpdateStreams({});
    let streamMetadata;
    try {
      const siteMetadata = yield this.client.ContentObjectMetadata({
        libraryId: yield this.client.ContentObjectLibraryId({objectId: this.siteId}),
        objectId: this.siteId,
        select: [
          "public/asset_metadata/live_streams"
        ],
        resolveLinks: true,
        resolveIgnoreErrors: true,
        resolveIncludeSource: true
      });

      streamMetadata = siteMetadata?.public?.asset_metadata?.live_streams || {};
    } catch(error) {
      streamStore.UpdateStreams({streams: {}});
      this.rootStore.SetErrorMessage("Error: Unable to load streams");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error(`Unable to load live streams for site ${this.siteId}.`);
    }

    yield this.client.utils.LimitedMap(
      10,
      Object.keys(streamMetadata),
      async slug => {
        const stream = streamMetadata[slug];

        const versionHash = stream?.["."]?.source;

        if(versionHash) {
          const objectId = this.client.utils.DecodeVersionHash(versionHash).objectId;
          const libraryId = await this.client.ContentObjectLibraryId({objectId});

          streamMetadata[slug].slug = slug;
          streamMetadata[slug].objectId = objectId;
          streamMetadata[slug].versionHash = versionHash;
          streamMetadata[slug].libraryId = libraryId;
          streamMetadata[slug].title = stream.title || stream.display_title;
          streamMetadata[slug].embedUrl = await this.EmbedUrl({objectId});

          const streamDetails = await this.LoadStreamMetadata({
            objectId,
            libraryId
          }) || {};

          Object.keys(streamDetails).forEach(detail => {
            streamMetadata[slug][detail] = streamDetails[detail];
          });
        } else {
          // eslint-disable-next-line no-console
          console.error(`No version hash for ${slug}`);
        }
      }
    );

    streamStore.UpdateStreams({streams: streamMetadata});
  });

  LoadLibraries = flow(function * () {
    if(this.libraries) { return; }

    try {
      let loadedLibraries = {};

      const libraryIds = yield this.client.ContentLibraries() || [];
      yield Promise.all(
        libraryIds.map(async libraryId => {
          let response;
          try {
            response = (await this.client.ContentObjectMetadata({
              libraryId,
              objectId: libraryId.replace(/^ilib/, "iq__"),
              metadataSubtree: "public/name"
            }));

            if(!response) { return; }

            loadedLibraries[libraryId] = {
              libraryId,
              name: response || libraryId
            };
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error(`Unable to load info for library: ${libraryId}`);
          }
        })
      );

      // eslint-disable-next-line no-unused-vars
      const sortedArray = Object.entries(loadedLibraries).sort(([id1, obj1], [id2, obj2]) => obj1.name.localeCompare(obj2.name));
      this.libraries = Object.fromEntries(sortedArray);
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load libraries", error);
    }
  });

  LoadAccessGroups = flow(function * () {
    if(this.accessGroups) { return; }

    try {
      if(!this.accessGroups) {
        this.accessGroups = {};
        const accessGroups = yield this.client.ListAccessGroups() || [];
        accessGroups
          .sort((a, b) => (a.meta.name || a.id).localeCompare(b.meta.name || b.id))
          .map(async accessGroup => {
            if(accessGroup.meta["name"]){
              this.accessGroups[accessGroup.meta["name"]] = accessGroup;
            } else {
              this.accessGroups[accessGroup.id] = accessGroup;
            }
          });
      }
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load access groups", error);
    }
  });

  LoadStreamMetadata = flow(function * ({objectId, libraryId}) {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const streamMeta = yield this.client.ContentObjectMetadata({
        objectId,
        libraryId,
        select: [
          "live_recording_config/probe_info/format/filename",
          "live_recording_config/probe_info/streams",
          "live_recording/recording_config/recording_params/origin_url",
          "live_recording/playout_config/simple_watermark",
          "live_recording/playout_config/image_watermark",
          "live_recording/playout_config/forensic_watermark",
          "live_recording/recording_config/recording_params/xc_params/connection_timeout",
          "live_recording/recording_config/recording_params/reconnect_timeout",
          "live_recording/playout_config/dvr_enabled",
          "live_recording/playout_config/dvr_start_time",
          "live_recording/playout_config/dvr_max_duration",
          "live_recording_config/reference_url",
          "live_recording_config/url",
          "live_recording_config/drm_type",
          "public/description",
          "public/name",
          "public/asset_metadata/display_title",
          "live_recording_config/part_ttl",
          "live_recording_config/playout_ladder_profile"
        ]
      });
      let probeMeta = streamMeta?.live_recording_config?.probe_info;

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

      let probeType = (probeMeta?.format?.filename)?.split("://")[0];
      if(probeType === "srt" && !probeMeta.format?.filename?.includes("listener")) {
        probeType = "srt-caller";
      }

      const videoStream = (probeMeta?.streams || []).find(stream => stream.codec_type === "video");
      const audioStreamCount = probeMeta?.streams ? (probeMeta?.streams || []).filter(stream => stream.codec_type === "audio").length : undefined;
      const simpleWatermark = streamMeta?.live_recording?.playout_config?.simple_watermark;
      const imageWatermark = streamMeta?.live_recording?.playout_config?.image_watermark;
      const forensicWatermark = streamMeta?.live_recording?.playout_config?.forensic_watermark;

      return {
        codecName: videoStream?.codec_name,
        connectionTimeout: streamMeta?.live_recording?.recording_config?.recording_params?.xc_params?.connection_timeout,
        description: streamMeta?.public?.description,
        display_title: streamMeta?.public?.asset_metadata?.display_title,
        drm: streamMeta?.live_recording_config?.drm_type,
        dvrEnabled: streamMeta?.live_recording?.playout_config?.dvr_enabled,
        dvrStartTime: streamMeta?.live_recording?.playout_config?.dvr_start_time,
        dvrMaxDuration: streamMeta?.live_recording?.playout_config?.dvr_max_duration,
        forensicWatermark,
        format: probeType,
        imageWatermark,
        originUrl: streamMeta?.live_recording?.recording_config?.recording_params?.origin_url || streamMeta?.live_recording_config?.url,
        partTtl: streamMeta?.live_recording_config?.part_ttl,
        playoutLadderProfile: streamMeta?.live_recording_config?.playout_ladder_profile,
        reconnectionTimeout: streamMeta?.live_recording?.recording_config?.recording_params?.reconnect_timeout,
        referenceUrl: streamMeta?.live_recording_config?.reference_url,
        simpleWatermark,
        title: streamMeta?.public?.name,
        videoBitrate: videoStream?.bit_rate,
        audioStreamCount,
        watermarkType: simpleWatermark ? "TEXT" : imageWatermark ? "IMAGE" : forensicWatermark ? "FORENSIC" : ""
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load stream metadata", error);
    }
  });

  LoadDetails = flow(function * ({libraryId, objectId, slug}) {
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

      streamStore.UpdateStream({
        key: slug,
        value: {
          title: streamMeta.asset_metadata?.title || streamMeta.asset_metadata?.display_title,
          description: streamMeta.description,
          display_title: streamMeta.asset_metadata?.display_title
        }
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load stream metadata", error);
    }
  });

  LoadPermission = flow(function * ({libraryId, objectId}) {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      return this.client.Permission({
        libraryId,
        objectId
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to load permission for ${objectId}`, error);
    }
  });

  LoadAccessGroupPermissions = flow(function * ({objectId}) {
    try {
      let groupAddress = "";

      const permissions = yield this.client.ContentObjectGroupPermissions({objectId});

      for(let address of Object.keys(permissions || {})) {
        if(permissions[address].includes("manage")) {
          groupAddress = address;
          break;
        }
      }

      return groupAddress;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to load access group permissions for ${objectId}`, error);
    }
  });

  LoadStreamUrls = flow(function * () {
    this.UpdateStreamUrls({});
    try {
      const response = yield this.client.StreamListUrls({siteId: this.siteId});

      const urls = {};
      Object.keys(response || {}).forEach(protocol => {
        response[protocol].forEach(protocolObject => {
          urls[protocolObject.url] = {
            ...protocolObject,
            protocol
          };
        });
      });

      this.UpdateStreamUrls({urls});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load stream URLs", error);
    }
  });

  LoadEdgeWriteTokenMeta = flow(function * ({
    objectId,
    libraryId
  }) {
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
  });

  LoadStreamProbeData = flow(function * ({
    objectId,
    libraryId
  }){
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      let probeMetadata = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config/probe_info",
      });

      // Phase out as new streams will have live_recording_config/probe_info
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

      const recordingParamsMetadata = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/recording_config/recording_params",
        select: [
          "ladder_specs"
        ]
      });

      const audioConfig = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config/audio"
      });

      const audioStreams = (probeMetadata.streams || [])
        .filter(stream => stream.codec_type === "audio");

      // Map used for form data
      const audioData = {};
      audioStreams.forEach(spec => {
        const audioConfigForIndex = audioConfig && audioConfig[spec.stream_index] ? audioConfig[spec.stream_index] : {};
        const ladderSpecsForIndex = recordingParamsMetadata && (recordingParamsMetadata.ladder_specs).find(i => i.stream_index === spec.stream_index);

        const initBitrate = RECORDING_BITRATE_OPTIONS.map(option => option.value).includes(spec.bit_rate) ? spec.bit_rate : 192000;

        audioData[spec.stream_index] = {
          bitrate: spec.bit_rate,
          codec: spec.codec_name,
          record: Object.hasOwn(audioConfigForIndex, "record") ? audioConfigForIndex.record : true,
          recording_bitrate: initBitrate,
          recording_channels: spec.channels,
          playout: Object.hasOwn(audioConfigForIndex, "playout") ? audioConfigForIndex.playout : true,
          playout_label: audioConfigForIndex.playout_label || `Audio ${spec.stream_index}`,
          lang: ladderSpecsForIndex?.lang,
          default: ladderSpecsForIndex?.default
        };
      });

      return {
        audioStreams,
        audioData
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load live_recording metadata", error);
    }
  });

  EmbedUrl = flow(function * ({
    objectId
  }) {
    try {
      return yield this.client.EmbedUrl({objectId, mediaType: "live_video"});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(error);
      return "";
    }
  });

  UpdateLadderProfiles = ({profiles}) => {
    this.ladderProfiles = profiles;
  };

  UpdateStreamUrls = ({urls}) => {
    this.liveStreamUrls = urls;
  };
}

export default DataStore;
