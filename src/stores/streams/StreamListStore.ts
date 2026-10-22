// Streams-page list: loading, paging, filtering, and the unscoped set used by stream pickers.
import {makeAutoObservable} from "mobx";
import {WithTimeout, FormatDateFilter, FormatStreamDate, GetDateRangePreset, DEFAULT_DATE_PRESET, type DateRangePreset} from "@/utils/helpers";
import type RootStore from "@/stores/RootStore";
import type {StreamInfo} from "@/stores/TenantStore";
import {
  NextTenantPageStart,
  StreamInfoFromTenantVersion,
  StreamListDataFromMeta,
  TENANT_CONTENT_PAGE_SIZE,
  TENANT_CONTENT_SELECT,
  TenantContentFilter,
  type StreamListData,
  type TenantContentVersion
} from "@/stores/lib/tenantContent";

type StreamMap = Record<string, StreamInfo>;

// Persisted so it survives navigation and reload - mirrors StreamGroupStore's expandedGroups.
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

class StreamListStore {
  rootStore: RootStore;
  tableFilter = "";
  tableTagFilter: string[] = [];
  // Streams-table selection and sort, held here so they survive page unmount.
  selectedRecords: StreamInfo[] = [];
  sortStatus: {columnAccessor: string, direction: "asc" | "desc"} = {columnAccessor: "date", direction: "desc"};
  // Date filter (preset + anchor date). Persisted via SetDateFilter. dateRangeFilter is derived.
  datePreset: DateRangePreset;
  referenceDate: Date;
  dateRangeFilter: [Date | null, Date | null];
  // Accumulated rows of the current tenant query; private cache behind LoadTenantLiveStreamContent.
  _tenantContent: StreamMap = {};
  loadingTenantLiveStreamContent = false;
  // Full, unscoped set for the map-to-stream modal. Separate from streamStatusStore.streams so neither clobbers the other.
  allStreams: StreamMap = {};
  allStreamsLoaded = false;
  loadingAllStreams = false;
  _allStreamsPromise: Promise<void> | null = null;
  // Paged tenant query state: has-more, fetch-in-flight, resume cursor, query params.
  tenantContentHasMore = false;
  loadingMoreTenantContent = false;
  _tenantContentPromise: Promise<void> | null = null;
  _tenantContentFilterKey: string | null = null;
  _tenantContentCursor = 0;
  _tenantContentQuery: {siteId: string, dateRange?: [Date | null, Date | null], nameFilter?: string[]} | null = null;
  // Bumped when the paged query restarts or the date filter changes; stale "load more" fetches discard against it.
  _tenantContentEpoch = 0;
  // Legacy site-object stream list (useContentGroup off); private cache behind _LoadSiteStreams.
  _siteStreams: StreamMap | null = null;
  streamsLoaded = false;
  // Whether the currently-loaded stream set is scoped to the streams page's date filter.
  // Pages that need the full set (Outputs, Monitor, stream mapping) reload when this is true.
  streamsScoped = false;
  // True while an additional page of streams is being fetched (scroll-to-load-more).
  loadingMoreStreams = false;
  _loadingStreams = false;
  _streamLoadId = 0;
  _loadingMoreStreams = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    const persisted = LoadPersistedDateFilter();
    this.datePreset = persisted.preset;
    this.referenceDate = persisted.referenceDate;
    this.dateRangeFilter = GetDateRangePreset(persisted.preset, persisted.referenceDate);

    makeAutoObservable(this, {
      rootStore: false,
      _tenantContent: false,
      _tenantContentPromise: false,
      _tenantContentFilterKey: false,
      _tenantContentCursor: false,
      _tenantContentQuery: false,
      _tenantContentEpoch: false,
      _allStreamsPromise: false,
      _siteStreams: false,
      _loadingStreams: false,
      _streamLoadId: false,
      _loadingMoreStreams: false
    }, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  // Tags found on streams that aren't declared in settings
  get discoverTags(): string[] {
    const declared = new Set(this.rootStore.settingsStore.declaredTags);
    const tags = new Set<string>();
    Object.values(this.rootStore.streamStatusStore.streams || {}).forEach(s => s.tags?.forEach(t => declared.has(t) || tags.add(t)));
    return Array.from(tags).sort();
  }

  // Declared tags first, then discover
  get allTags(): string[] {
    return [...this.rootStore.settingsStore.sortedDeclaredTags, ...this.discoverTags];
  }

  // Only the RADIO tag filters by name; every other tag matches the stream's own tags
  IsNameTag = (tag: string): boolean => {
    return this.rootStore.settingsStore.declaredTags.includes(tag) && tag.toLowerCase() === "radio";
  };

  StreamMatchesTag = (stream: StreamInfo, tag: string): boolean => {
    return this.IsNameTag(tag) ?
      !!stream.title?.toLowerCase().includes(tag.toLowerCase()) :
      !!stream.tags?.includes(tag);
  };

  get selectedDeclaredTags(): string[] {
    return this.activeTagFilter.filter(this.IsNameTag);
  }

  // A lone selected declared tag is sent to the tenant query; any more tags make the filter an OR, which the query (AND-only) can't express
  get declaredTagsOnServer(): string[] {
    return this.activeTagFilter.length === 1 ? this.selectedDeclaredTags : [];
  }

  // Selected tags matched client-side (metadata tags, or several tags OR'd), so the page loads the full set
  get declaredTagsNeedFullLoad(): boolean {
    return this.activeTagFilter.some(t => !this.declaredTagsOnServer.includes(t));
  }

  // Name terms (AND'd) sent to the tenant query: server-side declared tags only; search text is client-side
  get tenantNameTerms(): string[] {
    return this.declaredTagsOnServer.filter(Boolean);
  }

  // Search text is matched client-side (title, id, tags), so an active search loads the full set without paging
  get searchNeedsFullLoad(): boolean {
    return this.tableFilter.trim().length > 0;
  }

  // Suggestions for stream tag inputs: tags already on streams. Declared tags are filter shortcuts only.
  TagOptions = (exclude: string[] = []) => {
    const tags = new Set<string>();
    Object.values(this.rootStore.streamStatusStore.streams || {}).forEach(s => s.tags?.forEach(t => exclude.includes(t) || tags.add(t)));
    return Array.from(tags).sort();
  };

  get activeTagFilter(): string[] {
    // Not narrowed to loaded tags: a restored metadata tag may be absent from the first (scoped) page
    return this.tableTagFilter;
  }

  /**
   * Search term is a full/partial object id ("iq__…"). TenantContent can't filter on it,
   * so LoadStreamList loads the full set (no date scope, no paging) and filteredStreams
   * matches it client-side.
   */
  get tableFilterIsObjectId(): boolean {
    return /^iq__[A-Za-z0-9]*$/.test(this.tableFilter.trim());
  }

  // Tags matched client-side load the full set unscoped by date, so the selected date range is applied here
  get dateScopedClientSide(): boolean {
    const {useDateFilter, useContentGroup} = this.rootStore.settingsStore;
    return useDateFilter && useContentGroup && this.declaredTagsNeedFullLoad && !this.tableFilterIsObjectId;
  }

  // Client-side tag + text filtering (date scoping is server-side unless dateScopedClientSide). Text matches title, id and metadata tags.
  get filteredStreams(): StreamInfo[] {
    const filter = this.tableFilter.toLowerCase().trim();
    // A server-side declared tag is already applied by the tenant query
    const tagFilter = this.rootStore.settingsStore.useContentGroup ?
      this.activeTagFilter.filter(t => !this.declaredTagsOnServer.includes(t)) :
      this.activeTagFilter;
    const [start, end] = this.dateScopedClientSide ? this.dateRangeFilter : [null, null];
    const startKey = start ? FormatDateFilter(start) : "";
    const endKey = end ? FormatDateFilter(end) : "";
    return Object.values(this.rootStore.streamStatusStore.streams || {}).filter(s => {
      const date = FormatStreamDate(s.date);
      const matchesDate = !(startKey || endKey) || (!!date && (!startKey || date >= startKey) && (!endKey || date <= endKey));
      const matchesText = !filter ||
        s.title?.toLowerCase().includes(filter) ||
        s.objectId?.toLowerCase().includes(filter) ||
        s.tags?.some(t => t.toLowerCase().includes(filter));
      const matchesTags = tagFilter.length === 0 ||
        tagFilter.some(tag => this.StreamMatchesTag(s, tag));
      return matchesDate && matchesText && matchesTags;
    });
  }

  // Updates tags in both stream maps, without creating entries for streams outside the date scope
  SetStreamTags = ({slug, tags}: {slug: string, tags: string[]}) => {
    if(this.rootStore.streamStatusStore.streams[slug]) { this.rootStore.streamStatusStore.streams[slug].tags = tags; }
    if(this.allStreams[slug]) { this.allStreams[slug].tags = tags; }
  };

  /** Replace streamStatusStore.streams with a new list, then drop list state that no longer applies. */
  SetStreams = ({streams}: {streams: StreamMap}) => {
    this.rootStore.streamStatusStore._ReplaceStreams({streams});
    // Scoped list changed - the modal's full set may be stale; refetch on next open.
    this.allStreamsLoaded = false;
    this._allStreamsPromise = null;
    const remaining = this.allTags;
    // Drop stale tags only once declared tags and the full stream set are loaded; a restored tag may
    // simply be outside the first scoped page
    if(this.rootStore.settingsStore.loadedDeclaredTags && !this.tenantContentHasMore) {
      this.tableTagFilter = this.tableTagFilter.filter(t => remaining.includes(t));
    }
    this.selectedRecords = this.selectedRecords.filter(r => this.rootStore.streamStatusStore.streams[r.slug]);
  };

  SetSelectedRecords = (records: StreamInfo[]) => {
    this.selectedRecords = records;
  };

  SetSortStatus = (sortStatus: {columnAccessor: string, direction: "asc" | "desc"}) => {
    this.sortStatus = sortStatus;
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

  // Whether the streams page has more pages to load
  get hasMoreStreams(): boolean {
    return this.streamsScoped && this.tenantContentHasMore;
  }

  /** Tenant query params for the streams page's current search, tag and date filters. */
  _TenantQuery({scoped=true}: {scoped?: boolean} = {}) {
    const {siteId} = this.rootStore.tenantStore;
    const {useDateFilter} = this.rootStore.settingsStore;
    // An object-id search ("iq__…") can't be expressed as a TenantContent filter, and
    // client-side tag matches need every stream, so both load the full set.
    const fullScan = this.tableFilterIsObjectId || this.declaredTagsNeedFullLoad;

    return {
      siteId,
      dateRange: (scoped && useDateFilter && !fullScan ? this.dateRangeFilter : [null, null]) as [Date | null, Date | null],
      nameFilter: scoped ? this.tenantNameTerms : [],
      paged: scoped && !this.searchNeedsFullLoad && !this.declaredTagsNeedFullLoad
    };
  }

  /**
   * Start the streams page's first tenant query early (not awaited). LoadStreamList
   * picks up the same in-flight promise through the filter-key cache.
   */
  PrefetchStreamList() {
    if(!this.rootStore.settingsStore.useContentGroup) { return; }
    this.LoadTenantLiveStreamContent(this._TenantQuery());
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
      if(!this.rootStore.tenantStore.siteId || !this.rootStore.tenantStore.siteLibraryId) {
        yield this.rootStore.tenantStore.LoadTenantSiteData();
      }

      // useContentGroup picks the source of truth outright - no fall-through between the two.
      let streamMetadata;
      if(this.rootStore.settingsStore.useContentGroup) {
        // Tenant-wide content-group query. Scoped (streams page) loads one page at a
        // time; LoadMoreStreamList pulls the rest.
        streamMetadata = yield this.LoadTenantLiveStreamContent({...this._TenantQuery({scoped}), force: reload});
      } else {
        // Legacy: the site object's registered stream list.
        if(!this._siteStreams || reload) {
          yield this._LoadSiteStreams();
        }
        streamMetadata = this._siteStreams;
      }

      if(loadId !== this._streamLoadId) { return; }

      yield Promise.all([
        // Content-group query: skip per-object metadata fetches - list data is loaded separately.
        this.LoadStreams({streamMetadata, fetchObjectData: !this.rootStore.settingsStore.useContentGroup}),
        this.rootStore.outputStore.LoadOutputSettingsId()
      ]);

      if(loadId !== this._streamLoadId) { return; }

      this.streamsLoaded = true;
      this.streamsScoped = scoped;

      yield this.rootStore.streamStatusStore.LoadAllStreamsStatus(reload);
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
      const added = yield this.LoadMoreTenantLiveStreamContent();
      newSlugs = Object.keys(added || {});
      // A reload (e.g. date-filter change) kicked off while this page was in flight -
      // it will rebuild the list, so don't append these now-stale rows.
      if(newSlugs.length > 0 && this.streamsLoaded && !this._loadingStreams) {
        // Load-more only runs on the content-group path - skip per-object fetches.
        yield this.LoadStreams({streamMetadata: added, append: true, fetchObjectData: !this.rootStore.settingsStore.useContentGroup});
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
        yield this.rootStore.streamStatusStore.LoadAllStreamsStatus(true, newSlugs);
      } catch(error) {
        // eslint-disable-next-line no-console
        console.error("Unable to load status for newly-loaded streams", error);
      }
    }
  }

  /**
   * paged=true fetches only the first page and records a resume cursor; callers pull
   * further pages via LoadMoreTenantLiveStreamContent. paged=false (default) loops
   * through every page in one call.
   */
  *LoadTenantLiveStreamContent({siteId, dateRange, nameFilter, force=false, paged=false}: {siteId?: string, dateRange?: [Date | null, Date | null], nameFilter?: string[], force?: boolean, paged?: boolean} = {}): Generator<any, StreamMap> {
    if(!siteId) {
      // No site id - skip the tenant query; caller falls back to the site object's list.
      // eslint-disable-next-line no-console
      console.warn("LoadTenantLiveStreamContent: no siteId, skipping tenant query");
      this._tenantContent = {};
      this.tenantContentHasMore = false;
      return this._tenantContent;
    }

    const [startDate, endDate] = dateRange || [null, null];
    const name = (nameFilter || []).map(n => n.trim()).filter(Boolean);
    const filterKey = JSON.stringify([
      siteId,
      startDate ? FormatDateFilter(startDate) : null,
      endDate ? FormatDateFilter(endDate) : null,
      name,
      paged
    ]);

    if(!force && this._tenantContentPromise && this._tenantContentFilterKey === filterKey) {
      yield this._tenantContentPromise;
      return this._tenantContent;
    }

    this._tenantContentFilterKey = filterKey;
    let resolve: () => void;
    this._tenantContentPromise = new Promise(res => { resolve = res; });
    this.loadingTenantLiveStreamContent = true;

    // Reset the accumulated set and paging cursor for this fresh query.
    this._tenantContent = {};
    this.tenantContentHasMore = false;
    this._tenantContentCursor = 0;
    this._tenantContentQuery = {siteId, dateRange, nameFilter: name};
    // Any "load more" still in flight from a prior query is now stale.
    const epoch = ++this._tenantContentEpoch;

    try {
      const filter = TenantContentFilter(siteId, dateRange, name);
      let start = 0;
      let versions: TenantContentVersion[] = [];

      while(true) {
        const {versions: page, paging} = yield this.client.TenantContent({
          filter,
          start,
          limit: TENANT_CONTENT_PAGE_SIZE,
          select: TENANT_CONTENT_SELECT
        });

        const received = (page ?? []).length;
        versions = versions.concat(page ?? []);

        const next = NextTenantPageStart({paging, start, received, limit: TENANT_CONTENT_PAGE_SIZE});

        if(paged) {
          // One page per call - remember where to resume and stop.
          this._tenantContentCursor = next ?? start;
          this.tenantContentHasMore = next !== null;
          break;
        }

        if(next === null) { break; }
        start = next;
      }

      // A newer query started meanwhile - don't clobber its state with stale rows.
      if(epoch !== this._tenantContentEpoch) { return {}; }

      this._tenantContent = Object.fromEntries(
        versions
          .filter(({id, hash}) => id && hash)
          .map(version => [version.id, StreamInfoFromTenantVersion(version) as StreamInfo])
      );
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load tenant live stream content", error);
      this._tenantContentFilterKey = null;
    } finally {
      if(epoch === this._tenantContentEpoch) { this.loadingTenantLiveStreamContent = false; }
      resolve();
    }

    return this._tenantContent;
  }

  /**
   * Fetch the next page of the current paged tenant query, merge it into
   * _tenantContent, and return only the newly-added entries.
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
      const filter = TenantContentFilter(siteId, dateRange, nameFilter);
      const start = this._tenantContentCursor;

      const {versions, paging} = yield this.client.TenantContent({
        filter,
        start,
        limit: TENANT_CONTENT_PAGE_SIZE,
        select: TENANT_CONTENT_SELECT
      });

      // Query restarted while this page was in flight - drop stale rows.
      if(epoch !== this._tenantContentEpoch) { return {}; }

      const received = (versions ?? []).length;
      (versions ?? [])
        .filter(({id, hash}: TenantContentVersion) => id && hash && !this._tenantContent[id])
        .forEach((version: TenantContentVersion) => { added[version.id] = StreamInfoFromTenantVersion(version) as StreamInfo; });

      this._tenantContent = {...this._tenantContent, ...added};

      const next = NextTenantPageStart({paging, start, received, limit: TENANT_CONTENT_PAGE_SIZE});
      this._tenantContentCursor = next ?? start;
      this.tenantContentHasMore = next !== null;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load more tenant live stream content", error);
    } finally {
      this.loadingMoreTenantContent = false;
    }

    return added;
  }

  /**
   * Enrich a raw stream-metadata map with per-object data (objectId, libraryId, title,
   * tags, source/packaging, inputCfg); returns it without touching store state.
   * fetchObjectData=false skips the per-object fetch (content-group query loads list data separately).
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
        // eslint-disable-next-line no-console
        console.error(`No version hash for ${slug}`);
        return;
      }

      let objectId: string;
      try {
        objectId = this.client.utils.DecodeVersionHash(versionHash).objectId;
      } catch(error) {
        // eslint-disable-next-line no-console
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
            this.FetchStreamListData({objectId, libraryId}) as unknown as Promise<StreamListData | undefined>,
            OBJECT_LOOKUP_TIMEOUT_MS,
            `FetchStreamListData(${objectId})`
          ) || {};

          // Query-field name is the fallback title when the metadata fetch returns none.
          const queryFieldName = enriched[slug].name;
          Object.assign(enriched[slug], streamDetails);
          enriched[slug].title = enriched[slug].title || queryFieldName;
        } catch(error) {
          // eslint-disable-next-line no-console
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
    this.SetStreams({streams: append ? {...this.rootStore.streamStatusStore.streams, ...enriched} : enriched});
    this.rootStore.streamGroupStore.BuildGroups(this.rootStore.streamStatusStore.streams);
  }

  /** Full, unscoped stream set for the map-to-stream modal. Independent of the date-scoped query; no status polling. */
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
      const siteId = this.rootStore.tenantStore.siteId;
      let streamMetadata: StreamMap = {};

      if(siteId && this.rootStore.settingsStore.useContentGroup) {
        const filter = TenantContentFilter(siteId); // no date range - full set
        let start = 0;
        let versions: TenantContentVersion[] = [];

        while(true) {
          const {versions: page, paging} = yield this.client.TenantContent({
            filter,
            start,
            limit: TENANT_CONTENT_PAGE_SIZE,
            select: TENANT_CONTENT_SELECT
          });

          const received = (page ?? []).length;
          versions = versions.concat(page ?? []);

          const next = NextTenantPageStart({paging, start, received, limit: TENANT_CONTENT_PAGE_SIZE});
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
      if(!this.rootStore.settingsStore.useContentGroup) {
        streamMetadata = yield this._LoadSiteStreams();
      }

      // The modal needs inputCfg/source/packaging: the content-group query's select carries them, legacy fetches per object.
      this.allStreams = yield this._EnrichStreams({streamMetadata, fetchObjectData: !this.rootStore.settingsStore.useContentGroup});
      this.allStreamsLoaded = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load all streams", error);
      this._allStreamsPromise = null;
    } finally {
      this.loadingAllStreams = false;
      resolve();
    }

    return this.allStreams;
  }

  /**
   * Stream record (originUrl/source/packaging) for one object id. Uses the loaded maps when
   * the stream is there; otherwise reads just that object rather than paging the whole tenant.
   */
  *FetchStreamInfo(objectId: string): Generator<any, Partial<StreamInfo> | undefined> {
    const loaded = this.rootStore.streamStatusStore.streams?.[objectId] ?? this.allStreams?.[objectId];
    if(loaded) { return loaded; }

    const libraryId = yield this.client.ContentObjectLibraryId({objectId});
    const listData: StreamListData | undefined = yield this.FetchStreamListData({libraryId, objectId});
    if(!listData) { return undefined; }

    const {originUrl, source, packaging} = listData;
    return {originUrl, source, packaging};
  }

  /**
   * Load and enrich only the streams in one group (query_fields.title_id). Version
   * metadata is still paged in full; per-object enrichment runs for the group alone.
   * TODO: server-side title_id filter once the group-data source lands.
   */
  *FetchStreamsByTitleId(titleId: string): Generator<any, StreamMap> {
    const siteId = this.rootStore.tenantStore.siteId;
    if(!siteId || !titleId) { return {}; }

    const filter = TenantContentFilter(siteId);
    let start = 0;
    let versions: TenantContentVersion[] = [];

    while(true) {
      const {versions: page, paging} = yield this.client.TenantContent({
        filter,
        start,
        limit: TENANT_CONTENT_PAGE_SIZE,
        select: TENANT_CONTENT_SELECT
      });

      const received = (page ?? []).length;
      versions = versions.concat(page ?? []);

      const next = NextTenantPageStart({paging, start, received, limit: TENANT_CONTENT_PAGE_SIZE});
      if(next === null) { break; }
      start = next;
    }

    const streamMetadata: StreamMap = Object.fromEntries(
      versions
        .filter(({id, hash}) => id && hash)
        .map(version => [version.id, StreamInfoFromTenantVersion(version) as StreamInfo])
        .filter(([, info]) => (info as StreamInfo).titleId === titleId)
    );

    return yield this._EnrichStreams({streamMetadata, fetchObjectData: false});
  }

  *FetchStreamListData({libraryId, objectId}: {libraryId: string, objectId: string}): Generator<any, StreamListData | undefined> {
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
          "public/asset_metadata/date",
          "public/asset_metadata/time",
          "live_recording/recording_config/recording_params/xc_params/input_cfg",
          "live_recording/recording_config/recording_params/ladder_specs",
          "live_recording_config/url",
          "live_recording_config/recording_config/input_cfg"
        ]
      });

      return StreamListDataFromMeta(meta);
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load stream list data", error);
    }
  }

  // Fallback stream list: reads the site object's registered live_streams. Only used when
  // the tenant-wide tag query (LoadTenantLiveStreamContent) returns no content.
  *_LoadSiteStreams(): Generator<any, StreamMap> {
    try {
      if(!this.rootStore.tenantStore.siteLibraryId || !this.rootStore.tenantStore.siteId) {
        yield this.rootStore.tenantStore.LoadTenantSiteData();
      }

      const streamMetadata = yield this.client.ContentObjectMetadata({
        libraryId: this.rootStore.tenantStore.siteLibraryId,
        objectId: this.rootStore.tenantStore.siteId,
        metadataSubtree: "public/asset_metadata/live_streams",
        resolveIncludeSource: true,
        resolveLinks: true,
        resolveIgnoreErrors: true
      });

      this._siteStreams = streamMetadata || {};

      return this._siteStreams;
    } catch(error) {
      this.rootStore.SetErrorMessage("Error: Unable to load tenant streams");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error("Unable to load streams for tenant.");
    }
  }
}

export default StreamListStore;
