// Handles all metadata reads — tenant info, stream metadata, recording/playout config, probe data, permissions, and ladder profiles.
import {makeAutoObservable, observable, toJS} from "mobx";
import RootStore, {NetworkName} from "@/stores/RootStore";
import {StreamStatus} from "@/utils/constants";

export type PermissionLevel = "owner" | "editable" | "viewable" | "listable" | "public";

type PublicProtocol = "rtmp" | "srt" | "mpegts";
type DedicatedProtocol = "rtmp" | "mpegts";
type Region =
  | "as-east"
  | "au-east"
  | "eu-east-north"
  | "eu-east-south"
  | "eu-west-north"
  | "eu-west-south"
  | "na-east-north"
  | "na-east-south"
  | "na-west-north"
  | "na-west-south";

interface SrtEntry {
  label: string;
  region: Region;
  url: string;
}

interface QuickLinkEntry {
  region: Region;
  url: string;
}

interface SrtUrlInfo {
  quick_link_regions: Record<string, boolean>;
  quick_links: QuickLinkEntry[];
  srt_urls: SrtEntry[];
}

interface SrtTokenData {
  region: Region;
  issueTime: string;
  expirationTime: string;
  useSecure: boolean;
  label: string;
}

interface SrtPlayoutUrlParams {
  objectId: string;
  originUrl: string;
  fabricNode: string;
  tokenData?: SrtTokenData | null;
  quickLink?: boolean;
}

interface LibraryInfo {
  libraryId: string;
  name: string;
}

type LibraryMap = Record<string, LibraryInfo>;

interface AccessGroupInfo {
  address: string;
  id: string;
  meta: {
    commit: {
      author: string;
      author_address: string;
      message: string;
      timestamp: string;
    },
    name: string;
    public: {
      name: string;
    }
  }
}

type AccessGroupMap = Record<string, AccessGroupInfo>

export interface StreamInfo {
  ".": {
    source: string;
  };
  display_title: string;
  name?: string;
  order: number;
  slug: string;
  sources: Record<string, {
    ".": {container: string};
    "/": string;
  }>;
  title: string;
  title_type: string;
  video_type: string;
  // Fields added by LoadStreams enrichment
  objectId?: string;
  versionHash?: string;
  libraryId?: string;
  originUrl?: string;
  source?: string[];
  packaging?: string[];
  connectionTimeout: number;
  reconnectionTimeout: number;
  // Fields added by LoadSummaryData
  videoStreamProbe?: any;
  audioStreams?: any;
  audioData?: any;
  publishingVideo?: {bit_rate: any; frame_rate: any; resolution: string; codec: string};
  publishingAudio?: {sample_rate: any};
  partTtl?: string | number | null;
  persistent?: any;
  status?: StreamStatus;
  warnings?: any;
  quality?: any;
  embedUrl?: string;
  // Fields added by LoadDetails
  description?: string;
  configProfile?: string;
  // Fields added by LoadPlayoutConfigData
  drm?: any;
  dvrEnabled?: any;
  dvrMaxDuration?: string | null;
  dvrStartTime?: any;
  forensicWatermark?: any;
  imageWatermark?: any;
  simpleWatermark?: any;
  watermarkType?: string;
}

type StreamMap = Record<string, StreamInfo>;

interface DedicatedNodeInfo {
  description: string;
  name: string;
  urls: Record<DedicatedProtocol, string[]>
}

type DedicatedNodeMap = Record<string, DedicatedNodeInfo>;

interface StreamUrlInfo {
  active: boolean;
  protocol: PublicProtocol;
  url: string;
}

type StreamUrlMap = Record<string, StreamUrlInfo>;

class DataStore {
  rootStore: RootStore;
  loaded = false;
  loadedUrls = false;
  libraries: LibraryMap;
  accessGroups: AccessGroupMap;
  contentType: string;
  titleContentType: string;
  siteId: string;
  siteLibraryId: string;
  streamMetadata: StreamMap;
  liveStreamUrls: StreamUrlMap;
  dedicatedNodes: DedicatedNodeMap;
  srtUrlsByStream: Record<string, SrtUrlInfo>;
  loadedDedicatedNodes = false;
  streamsLoaded = false;
  _loadingStreams = false;
  _accessGroupsPromise: Promise<void> | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this, {streamMetadata: observable.ref, _loadingStreams: false, _accessGroupsPromise: false});
  }

  get client() {
    return this.rootStore.client;
  }

  get dedicatedNodesList(): {label: string, value: string}[] {
    return Object.entries(this.dedicatedNodes ?? {})
      .map(([key, value]) => ({label: value.name, value: key}));
  }

  DedicatedNodeUrls({nodeId, protocol}: {nodeId: string, protocol: DedicatedProtocol}) {
    if(!this.dedicatedNodes) { return []; }

    return this.dedicatedNodes?.[nodeId]?.urls?.[protocol] ?? [];
  }

  *Initialize(): Generator<any, void> {
    this.loaded = false;
    try {
      yield this.LoadTenantData();
      this.loaded = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to initialize", error);
      this.loaded = true;
    }
  }

  *LoadSiteStreams(reload=false): Generator<any, void> {
    if(this._loadingStreams && !reload) { return; }
    this._loadingStreams = true;
    this.streamsLoaded = false;
    try {
      if(!this.streamMetadata || reload) {
        yield this.LoadTenantData();
      }

      yield this.rootStore.streamStore.LoadStreams({streamMetadata: this.streamMetadata});
      yield this.rootStore.outputStore.LoadOutputSettingsId();
      this.streamsLoaded = true;
      yield this.rootStore.streamStore.AllStreamsStatus(reload);
    } catch(error) {
      this.streamsLoaded = true;
      // eslint-disable-next-line no-console
      console.error("Unable to load site streams", error);
    } finally {
      this._loadingStreams = false;
    }
  }

  *LoadTenantData(): Generator<any, {siteLibraryId: string, siteObjectId: string, streamMetadata: StreamMap}> {
    try {
      const {siteLibraryId, siteObjectId, streamMetadata, contentTypes} = yield this.client.StreamSiteSettings();
      const {live_stream, title} = contentTypes;

      if(live_stream) {
        this.contentType = live_stream;
      }

      if(title) {
        this.titleContentType = title;
      }

      this.siteId = siteObjectId;
      this.siteLibraryId = siteLibraryId;
      this.streamMetadata = streamMetadata;

      return {
        siteLibraryId,
        siteObjectId,
        streamMetadata
      };
    } catch(error) {
      this.rootStore.SetErrorMessage("Error: Unable to load tenant sites");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error("Unable to load sites for tenant.");
    }
  }

  *LoadLibraries(): Generator<any, void> {
    if(this.libraries) { return; }

    try {
      let loadedLibraries: LibraryMap = {};

      const libraryIds = yield this.client.ContentLibraries() || [];
      yield Promise.all(
        libraryIds.map(async (libraryId: string) => {
          let response: string | null;
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
            console.error(`Unable to load info for library: ${libraryId}`, error);
          }
        })
      );

      // eslint-disable-next-line no-unused-vars
      const sortedArray = Object.entries(loadedLibraries).sort(([_id1, obj1], [_id2, obj2]) => obj1.name.localeCompare(obj2.name));
      this.libraries = Object.fromEntries(sortedArray);
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load libraries", error);
    }
  }

  *LoadAccessGroups(): Generator<any, void> {
    if(this.accessGroups) { return; }

    if(this._accessGroupsPromise) {
      yield this._accessGroupsPromise;
      return;
    }

    let resolve: () => void;
    this._accessGroupsPromise = new Promise(res => { resolve = res; });

    try {
      const accessGroups = (yield this.client.ListAccessGroups()) || [];
      const result: AccessGroupMap = {};
      accessGroups
        .sort((a, b) => (a.meta.name || a.id).localeCompare(b.meta.name || b.id))
        .forEach(accessGroup => {
          if(accessGroup.meta["name"]) {
            result[accessGroup.meta["name"]] = accessGroup;
          } else {
            result[accessGroup.id] = accessGroup;
          }
        });
      this.accessGroups = result;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load access groups", error);
    } finally {
      resolve();
      this._accessGroupsPromise = null;
    }
  }

  *LoadPermission({libraryId, objectId}: {libraryId: string, objectId: string}): Generator<any, PermissionLevel> {
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
  }

  *LoadAccessGroupPermissions({objectId}: {objectId: string}): Generator<any, string> {
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
  }

  *LoadDedicatedNodes(): Generator<any, void> {
    this.loadedDedicatedNodes = false;
    try {
      if(!this.siteLibraryId) {
        const {siteObjectId, siteLibraryId} = yield this.LoadTenantData();
        this.siteId = siteObjectId;
        this.siteLibraryId = siteLibraryId;
      }

      const nodes = yield this.client.ContentObjectMetadata({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        metadataSubtree: "/dedicated_nodes"
      });
      this.UpdateDedicatedNodes({nodes});
      this.loadedDedicatedNodes = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load dedicated stream URLs", error);
    }
  }

  *LoadStreamUrls(): Generator<any, void> {
    this.loadedUrls = false;
    try {
      const response = yield this.client.StreamListUrls({siteId: this.siteId});

      const urls: StreamUrlMap = {};
      Object.keys(response || {}).forEach(protocol => {
        response[protocol].forEach((protocolObject: Omit<StreamUrlInfo, "protocol">) => {
          urls[protocolObject.url] = {
            ...protocolObject,
            protocol: protocol as PublicProtocol
          };
        });
      });

      this.UpdateStreamUrls({urls});
      this.loadedUrls = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load stream URLs", error);
    }
  }

  *LoadSrtPlayoutUrls(): Generator<any, void> {
    const srtUrls = yield this.client.ContentObjectMetadata({
      libraryId: yield this.client.ContentObjectLibraryId({objectId: this.siteId}),
      objectId: this.siteId,
      metadataSubtree: "srt_playout_info"
    });

    this.srtUrlsByStream = srtUrls || {};
  }

  // TODO: Move this to client-js
  *SrtPlayoutUrl({objectId, originUrl, fabricNode, tokenData=null, quickLink=false}: SrtPlayoutUrlParams): Generator<any, string> {
    try {
      let token = "", url: URL, port: number;
      const networkName: NetworkName | "" = this.rootStore.networkInfo?.name || "";

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
  }

  UpdateStreamUrls = ({urls}: {urls: StreamUrlMap}) => {
    this.liveStreamUrls = urls;
  };

  UpdateDedicatedNodes = ({nodes}: {nodes: DedicatedNodeMap}) => {
    this.dedicatedNodes = nodes;
  };

  UpdateSrtUrls({objectId, newData={}, removeData={}}: {objectId: string, newData: Partial<SrtEntry>, removeData: Partial<SrtEntry>}) {
    const urlsByStream = this.srtUrlsByStream[objectId];
    let srtUrls = urlsByStream?.srt_urls || [];

    if(removeData?.url) {
      srtUrls = srtUrls.filter(el => removeData.url !== el.url);
    }

    const {url, region, label} = newData;

    if(url && region && label) {
      const newValue: SrtEntry = {url, region, label};

      if(urlsByStream) {
        urlsByStream.srt_urls = [...srtUrls, newValue];
      } else {
        this.srtUrlsByStream[objectId] = {
          ...this.srtUrlsByStream[objectId],
          srt_urls: [newValue]
        };
      }
    }
  }

  UpdateSrtQuickLinks({objectId, newData={}, removeData={}}: {objectId: string, newData: Partial<QuickLinkEntry>, removeData: Partial<QuickLinkEntry>}) {
    const {region} = newData;
    if(!this.srtUrlsByStream[objectId]) {
      this.srtUrlsByStream[objectId] = {
        quick_link_regions: {[region]: true},
        quick_links: [],
        srt_urls: []
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

  *DeleteSrtUrl({objectId, region}: {objectId: string, region: Region}) {
    const urlsByStream = this.srtUrlsByStream[objectId];
    const newSrtUrls: SrtEntry[] = [];
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
  }

  *UpdateSiteSrtLinks({
    objectId,
    url,
    region,
    label,
    removeData={}
  }: SrtEntry & {objectId: string, removeData?: Partial<SrtEntry>}) {
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
  }

  *UpdateSiteQuickLinks({
    objectId,
    region,
    removeData={}
  }: {objectId: string, region: Region, removeData?: Partial<QuickLinkEntry>}) {
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
  }

  *LoadNodes({region}: {region: Region}) {
    yield this.client.UseRegion({region});
    const nodes = this.client.Nodes();

    if(region) {
      yield this.client.ResetRegion();
    }

    return nodes;
  }
}

export default DataStore;
