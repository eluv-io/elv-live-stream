// Tenant data: site/library ids, content types, libraries, access groups, and permissions.
import {makeAutoObservable} from "mobx";
import type RootStore from "@/stores/RootStore";
import type {Region} from "@/stores/SettingsStore";
import {StreamStatus} from "@/utils/constants";

export type PermissionLevel = "owner" | "editable" | "viewable" | "listable" | "public";

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
  // Placeholder pending API support - object creation date, epoch ms
  createdAt?: number;
  date?: string;
  eventTime?: string;
  titleId?: string;
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
  tags?: string[];
}


class DataStore {
  rootStore: RootStore;
  loaded = false;
  libraries: LibraryMap;
  accessGroups: AccessGroupMap;
  contentType: string;
  titleContentType: string;
  siteId: string;
  siteLibraryId: string;
  _accessGroupsPromise: Promise<void> | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this, {_accessGroupsPromise: false}, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  *Initialize(): Generator<any, void> {
    this.loaded = false;
    try {
      yield this.LoadTenantSiteData();
      this.loaded = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to initialize", error);
      this.loaded = true;
    }
  }

  // Resolves the site object id/library id from the tenant object, plus the tenant's
  // live_stream/title content types. Does NOT read the site's stream list (see StreamListStore).
  *LoadTenantSiteData(force=false): Generator<any, {siteLibraryId: string, siteObjectId: string, contentTypes: {live_stream?: string, title?: string}}> {
    if(this.siteId && this.siteLibraryId && !force) {
      return {
        siteLibraryId: this.siteLibraryId,
        siteObjectId: this.siteId,
        contentTypes: {live_stream: this.contentType, title: this.titleContentType}
      };
    }

    try {
      const tenantId = yield this.client.userProfileClient.TenantContractId();

      if(!tenantId) {
        throw new Error("Tenant ID not found. Ensure the user profile has a tenant contract configured.");
      }

      const tenantLibraryId = tenantId.replace("iten", "ilib");
      const tenantObjectId = tenantId.replace("iten", "iq__");

      const [siteObjectId, contentTypes] = yield Promise.all([
        this.client.ContentObjectMetadata({
          libraryId: tenantLibraryId,
          objectId: tenantObjectId,
          metadataSubtree: "public/sites/live_streams"
        }),
        this.client.ContentObjectMetadata({
          libraryId: tenantLibraryId,
          objectId: tenantObjectId,
          metadataSubtree: "public/content_types",
          select: ["live_stream", "title"]
        })
      ]);

      const siteLibraryId = yield this.client.ContentObjectLibraryId({objectId: siteObjectId});

      const liveManagementSettings = yield this.client.ContentObjectMetadata({
        libraryId: siteLibraryId,
        objectId: siteObjectId,
        metadataSubtree: "/live_management_settings",
        select: ["use_content_group", "use_date_filter"]
      });
      this.rootStore.settingsStore.SetLiveManagementSettings({
        useContentGroup: !!liveManagementSettings?.use_content_group,
        useDateFilter: !!liveManagementSettings?.use_date_filter
      });

      const customDomain = yield this.client.ContentObjectMetadata({
        libraryId: siteLibraryId,
        objectId: siteObjectId,
        metadataSubtree: "/custom_domain"
      });
      this.rootStore.settingsStore.SetCustomDomain({customDomain: customDomain ?? ""});

      const {live_stream, title} = contentTypes || {};
      if(live_stream) { this.contentType = live_stream; }
      if(title) { this.titleContentType = title; }

      this.siteId = siteObjectId;
      this.siteLibraryId = siteLibraryId;

      return {siteLibraryId, siteObjectId, contentTypes: contentTypes || {}};
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

  *LoadAccessGroups({force=false}: {force?: boolean}={}): Generator<any, void> {
    if(this.accessGroups && !force) { return; }

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
        objectId,
        clearCache: true
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
