// Tenant data: site/library ids, content types, libraries, access groups, permissions, and the stream list load.
import {makeAutoObservable, observable} from "mobx";
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

type StreamMap = Record<string, StreamInfo>;


class DataStore {
  rootStore: RootStore;
  loaded = false;
  libraries: LibraryMap;
  accessGroups: AccessGroupMap;
  contentType: string;
  titleContentType: string;
  siteId: string;
  siteLibraryId: string;
  streamMetadata: StreamMap;
  streamsLoaded = false;
  // Whether the currently-loaded stream set is scoped to the streams page's date filter.
  // Pages that need the full set (Outputs, Monitor, stream mapping) reload when this is true.
  streamsScoped = false;
  //  - useContentGroup: use the tenant-wide content-group query (new) vs. the site
  //    object's registered stream list (legacy).
  //  - useDateFilter: scope the stream list by date and show the streams-page date controls.
  useContentGroup = false;
  useDateFilter = false;
  // True while an additional page of streams is being fetched (scroll-to-load-more).
  loadingMoreStreams = false;
  _loadingStreams = false;
  _streamLoadId = 0;
  _loadingMoreStreams = false;
  _accessGroupsPromise: Promise<void> | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this, {streamMetadata: observable.ref, _loadingStreams: false, _streamLoadId: false, _loadingMoreStreams: false, _accessGroupsPromise: false}, {autoBind: true});
  }

  // Whether the streams page has more pages to load
  get hasMoreStreams(): boolean {
    return this.streamsScoped && this.rootStore.streamStore.tenantContentHasMore;
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

  // Shows the loader while a debounced reload is pending, instead of a stale or empty list
  MarkStreamsLoading() {
    this.streamsLoaded = false;
  }

  // scoped=true applies the streams page's date-range filter to the tenant query.
  // Callers that need the full stream map (Outputs, Monitor, stream mapping) pass
  // scoped=false so the list isn't limited to the currently-selected date range.
  *LoadStreamList({reload=false, scoped=true}: {reload?: boolean, scoped?: boolean} = {}): Generator<any, void> {
    if(this._loadingStreams && !reload) { return; }
    this._loadingStreams = true;
    // A newer load (e.g. a search typed mid-load) supersedes this one's results.
    const loadId = ++this._streamLoadId;
    this.streamsLoaded = false;
    // Drop any in-flight "load more" spinner - this rebuild replaces the list.
    this.loadingMoreStreams = false;
    try {
      // Need the site object id for the tenant query scope (and any site-list fallback)
      if(!this.siteId || !this.siteLibraryId) {
        yield this.LoadTenantSiteData();
      }

      // An object-id search ("iq__…") can't be expressed as a TenantContent filter,
      // so load the full set - no date scope, no paging - and let filteredStreams
      // narrow it client-side.
      const objectIdSearch = this.rootStore.streamStore.tableFilterIsObjectId;
      // Client-side tag matches need every stream, not just the date-scoped page
      const fullScan = objectIdSearch || this.rootStore.streamStore.declaredTagsNeedFullLoad;

      // Date scoping only applies when the site opts into it (useDateFilter).
      const dateRange: [Date | null, Date | null] =
        scoped && this.useDateFilter && !fullScan ? this.rootStore.streamStore.dateRangeFilter : [null, null];

      // useContentGroup picks the source of truth outright - no fall-through between the two.
      let streamMetadata;
      if(this.useContentGroup) {
        // Tenant-wide content-group query. Scoped (streams page) loads one page at a
        // time; LoadMoreStreamList pulls the rest.
        const nameFilter = scoped ? this.rootStore.streamStore.tenantNameTerms : [];
        streamMetadata = yield this.rootStore.streamStore.LoadTenantLiveStreamContent({siteId: this.siteId, dateRange, nameFilter, force: reload, paged: scoped && !this.rootStore.streamStore.searchNeedsFullLoad && !this.rootStore.streamStore.declaredTagsNeedFullLoad});
      } else {
        // Legacy: the site object's registered stream list.
        if(!this.streamMetadata || reload) {
          yield this.LoadTenantSiteStreams();
        }
        streamMetadata = this.streamMetadata;
      }

      if(loadId !== this._streamLoadId) { return; }

      yield Promise.all([
        // Content-group query: skip per-object metadata fetches - list data is loaded separately.
        this.rootStore.streamStore.LoadStreams({streamMetadata, fetchObjectData: !this.useContentGroup}),
        this.rootStore.outputStore.LoadOutputSettingsId()
      ]);

      if(loadId !== this._streamLoadId) { return; }

      this.streamsLoaded = true;
      this.streamsScoped = scoped;

      yield this.rootStore.streamStore.AllStreamsStatus(reload);
    } catch(error) {
      if(loadId === this._streamLoadId) { this.streamsLoaded = true; }
      // eslint-disable-next-line no-console
      console.error("Unable to load stream list", error);
    } finally {
      if(loadId === this._streamLoadId) { this._loadingStreams = false; }
    }
  }

  // Loads the next page of the paged tenant stream query and appends it to the list.
  // Called when the streams table is scrolled to the bottom.
  *LoadMoreStreamList(): Generator<any, void> {
    // Bail while the list itself is (re)building - it will replace the list anyway.
    // (streamsLoaded flips true once the list is ready, before the status-polling tail,
    // so this doesn't block on that long-running tail.)
    if(this._loadingMoreStreams || !this.streamsLoaded || !this.hasMoreStreams) { return; }

    this._loadingMoreStreams = true;
    this.loadingMoreStreams = true;
    let newSlugs: string[] = [];
    try {
      const added = yield this.rootStore.streamStore.LoadMoreTenantLiveStreamContent();
      newSlugs = Object.keys(added || {});
      // A reload (e.g. date-filter change) kicked off while this page was in flight -
      // it will rebuild the list, so don't append these now-stale rows.
      if(newSlugs.length > 0 && this.streamsLoaded && !this._loadingStreams) {
        // Load-more only runs on the content-group path - skip per-object fetches.
        yield this.rootStore.streamStore.LoadStreams({streamMetadata: added, append: true, fetchObjectData: !this.useContentGroup});
      } else {
        newSlugs = [];
      }
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load more site streams", error);
    } finally {
      // Clear the spinner as soon as the new rows are in - status polling for them
      // continues in the background and fills the Status column in as it resolves.
      this._loadingMoreStreams = false;
      this.loadingMoreStreams = false;
    }

    if(newSlugs.length > 0) {
      try {
        yield this.rootStore.streamStore.AllStreamsStatus(true, newSlugs);
      } catch(error) {
        // eslint-disable-next-line no-console
        console.error("Unable to load status for newly-loaded streams", error);
      }
    }
  }

  // Resolves the site object id/library id from the tenant object, plus the tenant's
  // live_stream/title content types. Does NOT read the site's stream list - use
  // LoadTenantSiteStreams for that (only needed when the tenant tag query returns nothing).
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
      this.useContentGroup = !!liveManagementSettings?.use_content_group;
      this.useDateFilter = !!liveManagementSettings?.use_date_filter;

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

  // Fallback stream list: reads the site object's registered live_streams. Only used when
  // the tenant-wide tag query (LoadTenantLiveStreamContent) returns no content.
  *LoadTenantSiteStreams(): Generator<any, StreamMap> {
    try {
      if(!this.siteLibraryId || !this.siteId) {
        yield this.LoadTenantSiteData();
      }

      const streamMetadata = yield this.client.ContentObjectMetadata({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        metadataSubtree: "public/asset_metadata/live_streams",
        resolveIncludeSource: true,
        resolveLinks: true,
        resolveIgnoreErrors: true
      });

      this.streamMetadata = streamMetadata || {};

      return this.streamMetadata;
    } catch(error) {
      this.rootStore.SetErrorMessage("Error: Unable to load tenant streams");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error("Unable to load streams for tenant.");
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
