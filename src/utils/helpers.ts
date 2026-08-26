import {FormatTime} from "@/utils/formatters";

export type DateRangePreset = "day" | "week" | "month" | "year" | "all";

export const DEFAULT_DATE_PRESET: DateRangePreset = "all";

export const DATE_RANGE_PRESET_OPTIONS: {value: DateRangePreset, label: string}[] = [
  {value: "day", label: "Day"},
  {value: "week", label: "Week"},
  {value: "month", label: "Month"},
  {value: "year", label: "Year"},
  {value: "all", label: "All"}
];

export const ShiftDateRangePreset = (preset: DateRangePreset, referenceDate: Date, direction: 1 | -1): Date => {
  const date = new Date(referenceDate);

  switch(preset) {
    case "day":
      date.setDate(date.getDate() + direction);
      break;

    case "week":
      date.setDate(date.getDate() + direction * 7);
      break;

    case "month":
      date.setMonth(date.getMonth() + direction);
      break;

    case "year":
      date.setFullYear(date.getFullYear() + direction);
      break;
  }

  return date;
};

export const GetDateRangePreset = (preset: DateRangePreset, referenceDate: Date = new Date()): [Date | null, Date | null] => {
  const now = referenceDate;
  const StartOfDay = (date: Date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
  const EndOfDay = (date: Date) => { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; };

  switch(preset) {
    case "day":
      return [StartOfDay(now), EndOfDay(now)];

    case "week": {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return [StartOfDay(start), EndOfDay(end)];
    }

    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return [StartOfDay(start), EndOfDay(end)];
    }

    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return [StartOfDay(start), EndOfDay(end)];
    }

    case "all":
    default:
      return [null, null];
  }
};

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

// Local-time YYYY-MM-DD, for date-range query filters (avoids the UTC day-shift of toISOString()).
export const FormatDateFilter = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

// Fails fast on a single slow/hung call (e.g. a permission-restricted object) instead of
// blocking a whole batch of concurrent requests indefinitely.
export const WithTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
    )
  ]);
