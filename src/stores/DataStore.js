// Handles all metadata reads — tenant info, stream metadata, recording/playout config, probe data, permissions, and ladder profiles.
import {flow, makeAutoObservable, runInAction, toJS} from "mobx";
import {RECORDING_BITRATE_OPTIONS} from "@/utils/constants";
import {Slugify} from "@/utils/helpers.js";

class DataStore {
  rootStore;
  loaded = false;
  tenantId;
  libraries;
  accessGroups;
  contentType;
  titleContentType;
  siteId;
  siteLibraryId;
  liveStreamUrls;
  ladderProfiles;
  srtUrlsByStream;

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
    this.loaded = false;
    try {
      const tenantContractId = yield this.LoadTenantInfo();
      const {streamMetadata, siteObjectId, siteLibraryId} = yield this.LoadTenantData({tenantContractId});

      this.siteId = siteObjectId;
      this.siteLibraryId = siteLibraryId;

      yield this.LoadStreams({streamMetadata});
      this.loaded = true;
      yield this.rootStore.streamBrowseStore.AllStreamsStatus(reload);
    } catch(error) {
      this.loaded = true;
    }
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
      const siteObjectId = yield this.client.ContentObjectMetadata({
        libraryId: tenantContractId.replace("iten", "ilib"),
        objectId: tenantContractId.replace("iten", "iq__"),
        metadataSubtree: "public/sites/live_streams",
      });
      const siteLibraryId = yield this.client.ContentObjectLibraryId({objectId: siteObjectId});
      const streamMetadata = yield this.client.ContentObjectMetadata({
        libraryId: siteLibraryId,
        objectId: siteObjectId,
        metadataSubtree: "public/asset_metadata/live_streams",
        resolveLinks: true,
        resolveIncludeSource: true,
        resolveIgnoreErrors: true
      });

      const response = yield this.client.ContentObjectMetadata({
        libraryId: tenantContractId.replace("iten", "ilib"),
        objectId: tenantContractId.replace("iten", "iq__"),
        metadataSubtree: "public/content_types",
        select: [
          "live_stream",
          "title"
        ]
      });
      const {live_stream, title} = response;

      if(live_stream) {
        this.contentType = live_stream;
      }

      if(title) {
        this.titleContentType = title;
      }

      return {
        siteLibraryId,
        siteObjectId,
        streamMetadata
      };
    } catch(error) {
      this.rootStore.SetErrorMessage("Error: Unable to load tenant sites");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error(`Unable to load sites for tenant ${tenantContractId}.`);
    }
  });

  LoadLadderProfiles = flow(function * () {
    try {
      const profiles = yield this.client.StreamLadderProfiles();

      this.UpdateLadderProfiles({profiles});

      return profiles;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load ladder profiles from site object", error);
    }
  });

  LoadStreams = flow(function * ({streamMetadata}) {
    this.rootStore.streamBrowseStore.UpdateStreams({});

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
        } catch(error) {
          // eslint-disable-next-line no-console
          console.error(`Failed to load stream ${slug}`, error);
        }
      }
    );

    this.rootStore.streamBrowseStore.UpdateStreams({streams: streamMetadata});
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

      let probeType = (liveRecordingConfigMeta?.url)?.split("://")[0];
      // if(probeType === "srt" && !probeMeta.format?.filename?.includes("listener")) {
      //   probeType = "srt-caller";
      // }

      // Stream Table Details
      const audioStreamCount = probeMeta?.streams ? (probeMeta?.streams || []).filter(stream => stream.codec_type === "audio").length : undefined;
      const tsEnabled = liveRecordingConfigMeta?.recording_config?.copy_mpegts;
      const source = tsEnabled ? [probeType, "ts"] : probeType ? [probeType] : [];
      const videoStream = (probeMeta?.streams || []).find(stream => stream.codec_type === "video");

      // General Config
      const configProfileName = liveRecordingConfigMeta?.name;

      // Recording Config
      const connectionTimeout = liveRecordingConfigMeta?.recording_config?.connection_timeout ?? liveRecordingMeta?.recording_config?.recording_params?.xc_params?.connection_timeout;
      const partTtl = liveRecordingConfigMeta?.recording_config?.part_ttl ?? liveRecordingMeta?.recording_config?.recording_params?.part_ttl;
      const reconnectionTimeout = liveRecordingConfigMeta?.recording_config?.reconnect_timeout ?? liveRecordingMeta?.recording_config?.recording_params?.reconnect_timeout;

      // Playout Config
      const dvrMaxDuration = liveRecordingMeta?.playout_config?.dvr_max_duration;
      const imageWatermark = liveRecordingConfigMeta?.playout_config?.image_watermark ?? liveRecordingMeta?.playout_config?.image_watermark;
      const forensicWatermark = liveRecordingConfigMeta?.playout_config?.forensic_watermark ?? liveRecordingMeta?.playout_config?.forensic_watermark;
      const simpleWatermark = liveRecordingConfigMeta?.playout_config?.simple_watermark ?? liveRecordingMeta?.playout_config?.simple_watermark;

      return {
        // Stream Table Details
        audioStreamCount,
        codecName: videoStream?.codec_name,
        source,
        videoBitrate: videoStream?.bit_rate,
        // General Config
        configProfile: Slugify(configProfileName),
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
        drm: liveRecordingConfigMeta?.playout_config?.playout_formats ?? liveRecordingMeta?.playout_config?.playout_formats,
        dvrEnabled: liveRecordingConfigMeta?.playout_config?.dvr ?? liveRecordingMeta?.playout_config?.dvr_enabled,
        dvrMaxDuration: dvrMaxDuration === undefined ? null : dvrMaxDuration.toString(),
        dvrStartTime: liveRecordingMeta?.playout_config?.dvr_start_time,
        forensicWatermark,
        imageWatermark,
        simpleWatermark,
        watermarkType: simpleWatermark ? "TEXT" : imageWatermark ? "IMAGE" : forensicWatermark ? "FORENSIC" : "",
        // Other Details
        egressEnabled: liveRecordingConfigMeta?.srt_egress_enabled,
        profileLastUpdated: generalMeta?.asset_metadata?.profile_last_updated,
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

      const urlMeta = yield this.client.ContentObjectMetadata({
        objectId,
        libraryId,
        metadataSubtree: "/",
        select: [
          "live_recording_config/url",
          "live_recording/recording_config/recording_params/origin_url"
        ]
      });

      this.rootStore.streamBrowseStore.UpdateStream({
        key: slug,
        value: {
          title: streamMeta?.name,
          description: streamMeta.description,
          display_title: streamMeta.asset_metadata?.display_title,
          originUrl: urlMeta?.live_recording?.recording_config?.recording_params?.origin_url || urlMeta?.live_recording_config?.url
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
    this.loadedUrls = false;
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
      this.loadedUrls = true;
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

  LoadRecordingConfigData = flow(function * ({
    libraryId,
    objectId
  }) {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const streams = this.rootStore.streamBrowseStore.streams || {};
      const slug = Object.keys(streams).find(slug => (
        streams[slug].objectId === objectId
      ));

      const liveRecordingMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/recording_config"
      });

      const liveRecordingConfigMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config/recording_config"
      });

      const connectionTimeout = liveRecordingConfigMeta?.connection_timeout ?? liveRecordingMeta?.recording_params?.xc_params?.connection_timeout;
      const copyMpegTs = liveRecordingMeta?.recording_params?.xc_params?.copy_mpegts;
      const inputCfg = liveRecordingMeta?.recording_params?.xc_params?.input_cfg;
      const persistent = liveRecordingMeta?.recording_params?.persistent;
      const retention = liveRecordingConfigMeta?.part_ttl ?? liveRecordingMeta?.recording_params?.part_ttl;
      const reconnectionTimeout = liveRecordingConfigMeta?.reconnect_timeout ?? liveRecordingMeta?.recording_params?.reconnect_timeout;

      const {audioStreams, audioData} = yield this.LoadStreamProbeData({
        libraryId,
        objectId
      });

      const recordingData = {
        audioStreams,
        audioData,
        connectionTimeout,
        copyMpegTs,
        inputCfg,
        persistent,
        reconnectionTimeout,
        retention
      };

      this.rootStore.streamBrowseStore.UpdateStream({key: slug, value: recordingData});

      return recordingData;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load recording config data", error);
      return {};
    }
  });

  LoadPlayoutConfigData = flow(function * ({libraryId, objectId}) {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const streams = this.rootStore.streamBrowseStore.streams || {};
      const slug = Object.keys(streams).find(slug => (
        streams[slug].objectId === objectId
      ));

      const liveRecordingMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording/playout_config"
      });

      const liveRecordingConfigMeta = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config/playout_config"
      });

      const drm = liveRecordingConfigMeta?.playout_formats ?? liveRecordingMeta?.playout_formats;
      const dvrEnabled = liveRecordingConfigMeta?.dvr ?? liveRecordingMeta?.dvr_enabled;
      const dvrMaxDuration = liveRecordingMeta?.dvr_max_duration === undefined ? null : (liveRecordingMeta.dvr_max_duration).toString();
      const dvrStartTime = liveRecordingMeta?.dvr_start_time;
      const imageWatermark = liveRecordingConfigMeta?.image_watermark ?? liveRecordingMeta?.image_watermark;
      const forensicWatermark = liveRecordingConfigMeta?.forensic_watermark ?? liveRecordingMeta?.forensic_watermark;
      const simpleWatermark = liveRecordingConfigMeta?.simple_watermark ?? liveRecordingMeta?.simple_watermark;
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

      this.rootStore.streamBrowseStore.UpdateStream({key: slug, value: playoutData});

      return playoutData;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load playout config data", error);
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

      let probeMetadataOptions = yield this.client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config",
        select: [
          "probe_info",
          "input_stream_info"
        ]
      });

      let probeMetadata =  probeMetadataOptions?.input_stream_info ?? probeMetadataOptions?.probe_info;

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

      const audioStreams = (probeMetadata.streams || [])
        .filter(stream => stream.codec_type === "audio");

      // Map used for form data
      const audioData = {};
      audioStreams.forEach((spec, i) => {
        const audioConfigForIndex = audioConfig && audioConfig[spec.stream_index] ? audioConfig[spec.stream_index] : {};

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
          default: audioConfigForIndex?.default
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

  LoadSrtPlayoutUrls = flow(function * () {
    const srtUrls = yield this.client.ContentObjectMetadata({
      libraryId: yield this.client.ContentObjectLibraryId({objectId: this.siteId}),
      objectId: this.siteId,
      metadataSubtree: "srt_playout_info"
    });

    this.srtUrlsByStream = srtUrls || {};
  });

  EmbedUrl = flow(function * ({objectId}) {
    try {
      const url = yield this.client.EmbedUrl({objectId, mediaType: "live_video"});

      return url;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(error);
      return "";
    }
  });

  // TODO: Move this to client-js
  SrtPlayoutUrl = flow(function * ({objectId, originUrl, fabricNode, tokenData=null, quickLink=false}){
    try {
      let token = "", url, port;
      const networkName = this.rootStore.networkInfo?.name || "";

      if(networkName.includes("main")) {
        port = 11080;
      } else if(networkName.includes("demo")) {
        port = 11090;
      } else if(networkName.includes("test")) {
        port = 11091;
      }

      if(quickLink) {
        const permission = yield this.client.Permission({objectId, clearCache: true});
        let urlObject;

        if(fabricNode) {
          urlObject = new URL(fabricNode);
        } else {
          const nodes = yield this.client.UseRegion({region: tokenData.region});
          urlObject = new URL(nodes.fabricURIs[0]);
          yield this.client.ResetRegion();
        }

        if(permission === "public") {
          const contentSpaceId = yield this.client.ContentSpaceId();
          token = this.client.utils.B64(
            JSON.stringify({ qspace_id: contentSpaceId })
          );
        } else {
          token = yield this.client.CreateSignedToken({
            objectId,
            duration: 14 * 24 * 60 * 60 * 1000 // 2 weeks
          });
        }

        url = new URL(`srt://${urlObject.hostname}:${port}`);
      } else if(tokenData) {
        const {issueTime, expirationTime, label, useSecure, region} = tokenData;
        let urlObject;

        if(fabricNode) {
          urlObject = new URL(fabricNode);
        } else {
          const nodes = yield this.client.UseRegion({region});
          urlObject = new URL(nodes.fabricURIs[0]);
          yield this.client.ResetRegion();
        }

        url = new URL(`srt://${urlObject.hostname}:${port}`);
        if(useSecure) {
          token = yield this.client.CreateSignedToken({
            objectId,
            issueTime,
            expirationTime,
            context: {
              usr: {
                label
              }
            }
          });
        } else {
          // TODO: For unsecure signature, b58 encode JSON and use as token
        }
      } else {
        // Used to extract hostname
        const originUrlObject = new URL(originUrl);

        if(!originUrlObject) {
          // eslint-disable-next-line no-console
          console.error(`Invalid origin url: ${originUrl}`);
          return "";
        }

        url = new URL(`srt://${originUrlObject.hostname}:${port}`);

        token = yield this.client.CreateSignedToken({
          objectId,
          duration: 86400000
        });
      }

      if(!url) { return ""; }

      url.searchParams.set("streamid", `live-ts.${objectId}${token ? `.${token}` : ""}`);

      return url.toString();
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

  UpdateSrtUrls({objectId, newData={}, removeData={}}) {
    const urlsByStream = this.srtUrlsByStream[objectId];
    let srtUrls = urlsByStream?.srt_urls || [];

    if(removeData?.url) {
      srtUrls = srtUrls.filter(el => removeData.url !== el.url);
    }

    const {url, region, label} = newData;
    const newValue = {url, region, label};

    if(urlsByStream) {
      urlsByStream.srt_urls = [
        ...srtUrls || [],
        newValue
      ];
    } else {
      this.srtUrlsByStream[objectId] = {
        ...this.srtUrlsByStream[objectId],
        srt_urls: [newValue]
      };
    }
  }

  UpdateSrtQuickLinks({objectId, newData={}, removeData={}}) {
    const {region} = newData;
    if(!this.srtUrlsByStream[objectId]) {
      this.srtUrlsByStream[objectId] = {
        quick_link_regions: {
          [region]: true
        }
      };
    } else {
      const urlsByStream = this.srtUrlsByStream[objectId];
      let quickLinkRegions = urlsByStream?.quick_link_regions;

      if(removeData?.region) {
        delete quickLinkRegions.region;
      }

      if(!quickLinkRegions) {
        urlsByStream["quick_link_regions"] = {
          [region]: true
        };
      } else {
        quickLinkRegions[region] = true;
      }
    }
  }

  DeleteSrtUrl = flow(function * ({objectId, region}) {
    const urlsByStream = this.srtUrlsByStream[objectId];
    const newSrtUrls = [];
    urlsByStream.srt_urls.forEach(urlObj => {
      if(urlObj.region !== region) {
        newSrtUrls.push(toJS(urlObj));
      }
    });

    const libraryId = yield this.client.ContentObjectLibraryId({objectId: this.siteId});
    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId: this.siteId
    });

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId: this.siteId,
      writeToken,
      metadataSubtree: `/srt_playout_info/${objectId}/srt_urls`,
      metadata: newSrtUrls
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId: this.siteId,
      writeToken,
      commitMessage: "Delete srt url"
    });

    this.srtUrlsByStream[objectId].srt_urls = newSrtUrls;
  });

  UpdateSiteSrtLinks = flow(function * ({
    objectId,
    url,
    region,
    label,
    removeData={}
  }) {
    if(!this.siteId) { return; }

    const libraryId = yield this.client.ContentObjectLibraryId({objectId: this.siteId});
    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId: this.siteId
    });

    this.UpdateSrtUrls({
      objectId,
      newData: {
        url,
        region,
        label,
      },
      removeData
    });

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId: this.siteId,
      writeToken,
      metadataSubtree: `/srt_playout_info/${objectId}/srt_urls`,
      metadata: toJS(this.srtUrlsByStream[objectId]?.srt_urls || [])
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId: this.siteId,
      writeToken,
      commitMessage: "Update srt url"
    });
  });

  UpdateSiteQuickLinks = flow(function * ({
    objectId,
    region,
    removeData={}
  }) {
    try {
      if(!this.siteId) { return; }

      const libraryId = yield this.client.ContentObjectLibraryId({objectId: this.siteId});
      const {writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId: this.siteId
      });

      this.UpdateSrtQuickLinks({
        objectId,
        newData: {
          region
        },
        removeData
      });

      yield this.client.ReplaceMetadata({
        libraryId,
        objectId: this.siteId,
        writeToken,
        metadataSubtree: `/srt_playout_info/${objectId}/quick_link_regions`,
        metadata: toJS(this.srtUrlsByStream[objectId]?.quick_link_regions || {})
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId: this.siteId,
        writeToken,
        commitMessage: "Update srt quick link"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update site", error);
      throw error;
    }
  });

  LoadNodes = flow(function * ({region}) {
    yield this.client.UseRegion({region});
    const nodes = this.client.Nodes();

    if(region) {
      yield this.client.ResetRegion();
    }

    return nodes;
  });
}

export default DataStore;
