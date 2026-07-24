import {FormatTime} from "@/utils/formatters";

export const SortTable = ({sortStatus, AdditionalCondition}: {sortStatus: {columnAccessor: string, direction: string}, AdditionalCondition?: (a: Record<string, any>, b: Record<string, any>) => number | undefined}) => {
  return (a, b) => {
    if(AdditionalCondition && typeof AdditionalCondition(a, b) !== "undefined") {
      return AdditionalCondition(a, b);
    }

    a = a[sortStatus.columnAccessor];
    b = b[sortStatus.columnAccessor];

    if(typeof a === "number" && typeof b === "number") {
      a = isNaN(a) ? 0 : a;
      b = isNaN(b) ? 0 : b;
    } else {
      a = typeof a === "string" ? a.trim().toLowerCase() : a ?? "";
      b = typeof b === "string" ? b.trim().toLowerCase() : b ?? "";
    }

    if(a === b) { return 0; }

    return (a < b ? -1 : 1) * (sortStatus.direction === "asc" ? 1 : -1);
  };
};

export const SanitizeUrl = ({url, removeQueryParams=[]}: {url?: string, removeQueryParams?: string[]}) : string => {
  if(!url) {
    return "";
  }

  try {
    const urlObject = new URL(url);
    urlObject.searchParams.delete("passphrase");
    removeQueryParams.forEach(param => {
      urlObject.searchParams.delete(param);
    });

    return urlObject.toString();
  } catch {
    // Only apply the regex fallback for strings that look like a URL (have a scheme).
    // Plain invalid strings (e.g. "not a valid url") should return false.
    if(!url.includes("://")) { return ""; }
    // Fallback for URLs with out-of-range ports (e.g. rtp://) that new URL() rejects
    const paramsToRemove = ["passphrase", ...removeQueryParams];
    return paramsToRemove.reduce((acc, param) => {
      return acc.replace(new RegExp(`([?&])${param}=[^&]*(&?)`, "g"), (_, prefix, suffix) => {
        return suffix ? prefix : "";
      });
    }, url);
  }
};

export const CheckExpiration = (date: number): boolean => {
  const today = new Date();
  const inputDate = new Date(date);

  inputDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return inputDate < today;
};

interface RuntimeParams {
  startTime: number;
  endTime?: number;
  currentTimeMs: number;
  format: string;
  active: boolean;
}

export const Runtime = ({
  startTime,
  endTime,
  currentTimeMs,
  format="hh,mm,ss",
  active
}: RuntimeParams): string => {
  let time: string;

  if(!endTime && !active) {
    return "--";
  } else if(!endTime) {
    endTime = currentTimeMs;
  }

  if(!startTime) {
    time = "--";
  } else {
    time = FormatTime({
      milliseconds: endTime - startTime,
      format
    });
  }

  return time;
};

// Copy of elv-client-js's `slugify`. Importing it from
// `@eluvio/elv-client-js/utilities/lib/helpers.js` pulls that whole module in,
// about 24KB gzip in the entry chunk for a one-line regex.
//
// Keep this in sync if the upstream implementation ever changes. Profile slugs
// are persisted in the site object under `stream_profiles`, so drift would
// orphan existing stream/profile associations. See helpers.test.ts for the
// cases verified against upstream.
export const slugify = (str?: string): string =>
  (str || "").toLowerCase().trim().replace(/ /g, "-").replace(/[^a-z0-9-]/g, "");
