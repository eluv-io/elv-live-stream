// Site-object settings: dedicated nodes, declared tags, custom domain, SRT links, stream URLs, and stream links.
import {makeAutoObservable, toJS} from "mobx";
import type RootStore from "@/stores/RootStore";
import type {NetworkName} from "@/stores/RootStore";

type PublicProtocol = "rtmp" | "srt" | "mpegts";
export type DedicatedProtocol = "rtp" | "srt" | "mpegts";
export type Region =
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

class SettingsStore {
  rootStore: RootStore;
  loadedUrls = false;
  liveStreamUrls: StreamUrlMap;
  dedicatedNodes: DedicatedNodeMap;
  loadedDedicatedNodes = false;
  srtUrlsByStream: Record<string, SrtUrlInfo>;
  // Saved order; the Declared Tags settings page edits this list as-is.
  declaredTags: string[] = [];
  loadedDeclaredTags = false;
  customDomain = "";
  loadedCustomDomain = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this, {rootStore: false}, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  get sortedDeclaredTags(): string[] {
    return [...(this.declaredTags ?? [])].sort();
  }

  get siteId(): string {
    return this.rootStore.dataStore.siteId;
  }

  get siteLibraryId(): string {
    return this.rootStore.dataStore.siteLibraryId;
  }

  get dedicatedNodesList(): {label: string, value: string}[] {
    return Object.entries(this.dedicatedNodes ?? {})
      .map(([key, value]) => ({label: value.name, value: key}));
  }

  DedicatedNodeUrls({nodeId, protocol}: {nodeId: string, protocol: DedicatedProtocol}) {
    if(!this.dedicatedNodes) { return []; }

    return this.dedicatedNodes?.[nodeId]?.urls?.[protocol] ?? [];
  }

  *LoadDedicatedNodes(): Generator<any, void> {
    this.loadedDedicatedNodes = false;
    try {
      if(!this.siteLibraryId) {
        yield this.rootStore.dataStore.LoadTenantSiteData();
      }

      const nodes = yield this.client.ContentObjectMetadata({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        metadataSubtree: "/dedicated_nodes"
      });
      this.SetDedicatedNodes({nodes});
      this.loadedDedicatedNodes = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load dedicated stream URLs", error);
    }
  }

  // Reads a subtree of the site object, loading site data first if needed
  *_ReadSiteMetadata(metadataSubtree: string): Generator<any, any> {
    if(!this.siteLibraryId) {
      yield this.rootStore.dataStore.LoadTenantSiteData();
    }

    return yield this.client.ContentObjectMetadata({
      libraryId: this.siteLibraryId,
      objectId: this.siteId,
      metadataSubtree
    });
  }

  // Replaces a subtree of the site object in its own edit + finalize
  *_WriteSiteMetadata({metadataSubtree, metadata, commitMessage}: {metadataSubtree: string, metadata: unknown, commitMessage: string}): Generator<any, void> {
    if(!this.siteLibraryId) {
      yield this.rootStore.dataStore.LoadTenantSiteData();
    }

    const libraryId = this.siteLibraryId;
    const objectId = this.siteId;
    const {writeToken} = yield this.client.EditContentObject({libraryId, objectId});

    try {
      yield this.client.ReplaceMetadata({libraryId, objectId, writeToken, metadataSubtree, metadata});
      yield this.client.FinalizeContentObject({libraryId, objectId, writeToken, commitMessage, awaitCommitConfirmation: true});
    } catch(error) {
      try {
        yield this.client.DeleteWriteToken({writeToken});
      } catch(discardError) {
        // eslint-disable-next-line no-console
        console.error("Failed to discard write token", discardError);
      }

      throw error;
    }
  }

  *LoadDeclaredTags(): Generator<any, void> {
    this.loadedDeclaredTags = false;
    try {
      const tags = yield this._ReadSiteMetadata("/declared_tags");
      this.SetDeclaredTags({tags: tags ?? []});
      this.loadedDeclaredTags = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load declared tags", error);
    }
  }

  *LoadCustomDomain(): Generator<any, void> {
    this.loadedCustomDomain = false;
    try {
      const customDomain = yield this._ReadSiteMetadata("/custom_domain");
      this.SetCustomDomain({customDomain: customDomain ?? ""});
      this.loadedCustomDomain = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load custom domain", error);
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

      this.SetStreamUrls({urls});
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
  *FetchSrtPlayoutUrl({objectId, originUrl, fabricNode, tokenData=null, quickLink=false}: SrtPlayoutUrlParams): Generator<any, string> {
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

  SetStreamUrls = ({urls}: {urls: StreamUrlMap}) => {
    this.liveStreamUrls = urls;
  };

  SetDedicatedNodes = ({nodes}: {nodes: DedicatedNodeMap}) => {
    this.dedicatedNodes = nodes;
  };

  *SaveDedicatedNodes({nodes, commitMessage="Update dedicated nodes"}: {nodes: DedicatedNodeMap, commitMessage?: string}): Generator<any, void> {
    try {
      if(!this.siteLibraryId) {
        yield this.rootStore.dataStore.LoadTenantSiteData();
      }

      const {writeToken} = yield this.client.EditContentObject({
        libraryId: this.siteLibraryId,
        objectId: this.siteId
      });

      yield this.client.ReplaceMetadata({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        writeToken,
        metadataSubtree: "/dedicated_nodes",
        metadata: toJS(nodes)
      });

      yield this.client.FinalizeContentObject({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        writeToken,
        commitMessage,
        awaitCommitConfirmation: true
      });

      this.SetDedicatedNodes({nodes});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save dedicated nodes", error);
      throw error;
    }
  }

  SetDeclaredTags = ({tags}: {tags: string[]}) => {
    this.declaredTags = tags;
  };

  *SaveDeclaredTags({tags, commitMessage="Update declared tags"}: {tags: string[], commitMessage?: string}): Generator<any, void> {
    try {
      yield this._WriteSiteMetadata({metadataSubtree: "/declared_tags", metadata: toJS(tags), commitMessage});
      this.SetDeclaredTags({tags});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save declared tags", error);
      throw error;
    }
  }

  SetCustomDomain = ({customDomain}: {customDomain: string}) => {
    this.customDomain = customDomain;
  };

  *SaveCustomDomain({customDomain, commitMessage="Update custom domain"}: {customDomain: string, commitMessage?: string}): Generator<any, void> {
    try {
      yield this._WriteSiteMetadata({metadataSubtree: "/custom_domain", metadata: customDomain, commitMessage});
      this.SetCustomDomain({customDomain});
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save custom domain", error);
      throw error;
    }
  }

  SetSrtUrls({objectId, newData={}, removeData={}}: {objectId: string, newData: Partial<SrtEntry>, removeData: Partial<SrtEntry>}) {
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

  SetSrtQuickLinks({objectId, newData={}, removeData={}}: {objectId: string, newData: Partial<QuickLinkEntry>, removeData: Partial<QuickLinkEntry>}) {
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

  *SaveSrtLinks({
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

    this.SetSrtUrls({
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

  *SaveQuickLinks({
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

      this.SetSrtQuickLinks({
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

  CreateLink = ({
    targetHash,
    linkTarget="meta/public/asset_metadata",
    options={},
    autoUpdate=true
  }: {targetHash?: string, linkTarget?: string, options?: any, autoUpdate?: boolean}): {".": any, "/": string} => {
    return {
      ...options,
      ".": {
        ...(options["."] || {}),
        ...autoUpdate ? {"auto_update": {"tag": "latest"}} : undefined
      },
      "/": `/qfab/${targetHash}/${linkTarget}`
    };
  };

  *SaveStreamLink({objectId, slug}: {objectId: string, slug: string}): Generator<any, void> {
    try {
      const originalLink = yield this.client.ContentObjectMetadata({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        metadataSubtree: `public/asset_metadata/live_streams/${slug}`,
      });

      const link = this.CreateLink({
        targetHash: yield this.client.LatestVersionHash({objectId}),
        options: originalLink
      });

      const {writeToken} = yield this.client.EditContentObject({
        libraryId: this.siteLibraryId,
        objectId: this.siteId
      });

      yield this.client.ReplaceMetadata({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        writeToken,
        metadataSubtree: `public/asset_metadata/live_streams/${slug}`,
        metadata: link
      });

      yield this.client.FinalizeContentObject({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        writeToken,
        commitMessage: "Update stream link",
        awaitCommitConfirmation: true
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update stream link", error);
    }
  }
}

export default SettingsStore;
