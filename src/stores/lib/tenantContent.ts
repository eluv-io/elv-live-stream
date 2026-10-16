// TenantContent query helpers: filter building, paging, and mapping query versions to StreamInfo.
import {FormatDateFilter} from "@/utils/helpers";
import {LIVE_STREAM_DATE_TAG_KEY, LIVE_STREAM_DATE_TAG_PREFIX} from "@/utils/constants";
import {DeriveSourceAndPackaging, StreamMetadata} from "@/utils/stream/stream";
import type {StreamInfo} from "@/stores/DataStore";

export type StreamListData = Pick<StreamMetadata, "title" | "display_title" | "originUrl" | "source" | "packaging" | "inputCfg" | "ladderSpecs" | "tags" | "date" | "eventTime"> & {
  configured: boolean;
};

export interface TenantContentVersion {
  id: string;
  hash: string;
  type: string;
  object_version: number;
  error: string;
  query_fields?: Record<string, unknown>;
  meta?: Record<string, any>;
}

export interface TenantContentPaging {
  start?: number;
  limit?: number;
  total?: number;
  items?: number;
  pages?: number;
  next?: number | null;
  more?: boolean;
}

export const TENANT_CONTENT_PAGE_SIZE = 100;

// Meta paths needed to build StreamInfo from a tenant query version without a per-object fetch.
export const TENANT_CONTENT_SELECT = [
  "public/name",
  "public/asset_metadata/display_title",
  "public/asset_metadata/tags",
  "public/asset_metadata/date",
  "public/asset_metadata/time",
  "live_recording/recording_config/recording_params/xc_params/input_cfg",
  "live_recording/recording_config/recording_params/ladder_specs",
  "live_recording_config/url",
  "live_recording_config/recording_config/input_cfg"
];

/** Single value of a query field (first entry for arrays); undefined if empty. */
export const QueryFieldValue = (fields: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = Array.isArray(fields?.[key]) ? (fields?.[key] as unknown[])[0] : fields?.[key];
  return value == null || value === "" ? undefined : String(value);
};

/** Streams-list fields from a metadata subtree (per-object fetch or the tenant query's `meta`). */
export const StreamListDataFromMeta = (meta: Record<string, any> | undefined): StreamListData => {
  const url = meta?.live_recording_config?.url;
  const inputCfg =
    meta?.live_recording?.recording_config?.recording_params?.xc_params?.input_cfg ??
    meta?.live_recording_config?.recording_config?.input_cfg;
  const {source, packaging} = DeriveSourceAndPackaging({url, inputCfg});

  return {
    title: meta?.public?.name,
    display_title: meta?.public?.asset_metadata?.display_title,
    tags: meta?.public?.asset_metadata?.tags ?? [],
    originUrl: url,
    source,
    packaging,
    inputCfg,
    ladderSpecs: meta?.live_recording?.recording_config?.recording_params?.ladder_specs,
    configured: !!meta?.live_recording?.recording_config?.recording_params?.xc_params?.input_cfg,
    date: meta?.public?.asset_metadata?.date,
    eventTime: meta?.public?.asset_metadata?.time
  };
};

/** StreamInfo from a tenant query version: `meta` fields first, query_fields as fallback. */
export const StreamInfoFromTenantVersion = (version: TenantContentVersion): Partial<StreamInfo> => {
  const name = QueryFieldValue(version.query_fields, "name");
  const date = QueryFieldValue(version.query_fields, "date");
  const titleId = QueryFieldValue(version.query_fields, "title_id");

  const info: Partial<StreamInfo> = {versionHash: version.hash};

  if(version.meta) {
    const listData = StreamListDataFromMeta(version.meta);
    if(listData.title != null) { info.title = listData.title; }
    if(listData.display_title != null) { info.display_title = listData.display_title; }
    if(listData.tags?.length) { info.tags = listData.tags; }
    if(listData.originUrl != null) { info.originUrl = listData.originUrl; }
    if(listData.source?.length) { info.source = listData.source; }
    if(listData.packaging?.length) { info.packaging = listData.packaging; }
    if(listData.date != null) { info.date = listData.date; }
    if(listData.eventTime != null) { info.eventTime = listData.eventTime; }
    // inputCfg isn't on StreamInfo's type; _EnrichStreams attaches it the same way.
    if(listData.inputCfg != null) { (info as any).inputCfg = listData.inputCfg; }
    if(listData.ladderSpecs != null) { (info as any).ladderSpecs = listData.ladderSpecs; }
    (info as any).configured = listData.configured;
  }

  if(name != null) {
    info.name = name;
    if(info.title == null) { info.title = name; }
  }

  if(date != null && info.date == null) { info.date = date; }

  if(titleId != null) { info.titleId = titleId; }

  return info;
};

/** TenantContent filter for a site, with optional date range and `name` contains terms. */
export const TenantContentFilter = (siteId: string, dateRange?: [Date | null, Date | null], nameFilter: string[] = []): string[] => {
  const [startDate, endDate] = dateRange || [null, null];
  const filter = [`group:eq:${siteId}`];

  nameFilter.forEach(name => filter.push(`name:co:${name}`));

  if(startDate && endDate && FormatDateFilter(startDate) === FormatDateFilter(endDate)) {
    filter.push(`tag:eq:${LIVE_STREAM_DATE_TAG_PREFIX}${FormatDateFilter(startDate)}`);
  } else if(startDate || endDate) {
    filter.push(`tag:co:${LIVE_STREAM_DATE_TAG_KEY}`);
    if(startDate) { filter.push(`tag:ge:${LIVE_STREAM_DATE_TAG_PREFIX}${FormatDateFilter(startDate)}`); }
    if(endDate) { filter.push(`tag:le:${LIVE_STREAM_DATE_TAG_PREFIX}${FormatDateFilter(endDate)}`); }
  }

  return filter;
};

/**
 * Start index of the next page, or null when none are left.
 * The paging shape has varied (next / more / pages / total), so each is checked, then "was this page full?".
 */
export const NextTenantPageStart = ({paging, start, received, limit}: {paging?: TenantContentPaging, start: number, received: number, limit: number}): number | null => {
  const nextStart = start + limit;

  if(paging) {
    if(paging.next != null) { return paging.next > start ? paging.next : null; }
    if(paging.more === true) { return nextStart; }
    if(paging.more === false) { return null; }
    if(typeof paging.pages === "number" && limit > 0) {
      return Math.floor(start / limit) + 1 < paging.pages ? nextStart : null;
    }
    if(typeof paging.total === "number") { return nextStart < paging.total ? nextStart : null; }
  }

  return received >= limit && received > 0 ? nextStart : null;
};
