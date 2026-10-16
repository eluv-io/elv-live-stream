import {describe, it, expect} from "vitest";
import {NextTenantPageStart, QueryFieldValue, StreamInfoFromTenantVersion, TenantContentFilter} from "@/stores/lib/tenantContent";

describe("QueryFieldValue", () => {
  it("returns the first entry of an array field", () => {
    expect(QueryFieldValue({name: ["a", "b"]}, "name")).toBe("a");
  });

  it("returns undefined for missing or empty values", () => {
    expect(QueryFieldValue(undefined, "name")).toBeUndefined();
    expect(QueryFieldValue({name: ""}, "name")).toBeUndefined();
  });
});

describe("TenantContentFilter", () => {
  it("scopes to the site group only when no range or names are given", () => {
    expect(TenantContentFilter("iq__site")).toEqual(["group:eq:iq__site"]);
  });

  it("adds a contains match per name term", () => {
    expect(TenantContentFilter("iq__site", undefined, ["foo", "bar"])).toEqual([
      "group:eq:iq__site", "name:co:foo", "name:co:bar"
    ]);
  });

  it("uses a single exact-match tag for a one-day range", () => {
    const day = new Date(2026, 0, 5);
    expect(TenantContentFilter("iq__site", [day, day])).toEqual([
      "group:eq:iq__site", "tag:eq:elv:date:2026-01-05"
    ]);
  });

  it("uses ge/le tags for a multi-day range", () => {
    expect(TenantContentFilter("iq__site", [new Date(2026, 0, 1), new Date(2026, 0, 7)])).toEqual([
      "group:eq:iq__site", "tag:co:elv:date", "tag:ge:elv:date:2026-01-01", "tag:le:elv:date:2026-01-07"
    ]);
  });
});

describe("NextTenantPageStart", () => {
  const base = {start: 0, received: 100, limit: 100};

  it("honors paging.next, ignoring non-advancing values", () => {
    expect(NextTenantPageStart({...base, paging: {next: 100}})).toBe(100);
    expect(NextTenantPageStart({...base, start: 100, paging: {next: 100}})).toBeNull();
  });

  it("honors paging.more", () => {
    expect(NextTenantPageStart({...base, paging: {more: true}})).toBe(100);
    expect(NextTenantPageStart({...base, paging: {more: false}})).toBeNull();
  });

  it("uses pages and total when present", () => {
    expect(NextTenantPageStart({...base, paging: {pages: 2}})).toBe(100);
    expect(NextTenantPageStart({...base, paging: {pages: 1}})).toBeNull();
    expect(NextTenantPageStart({...base, paging: {total: 150}})).toBe(100);
    expect(NextTenantPageStart({...base, paging: {total: 100}})).toBeNull();
  });

  it("falls back to whether the page was full", () => {
    expect(NextTenantPageStart(base)).toBe(100);
    expect(NextTenantPageStart({...base, received: 40})).toBeNull();
  });
});

describe("StreamInfoFromTenantVersion", () => {
  const version = {id: "iq__1", hash: "hq__1", type: "", object_version: 1, error: ""};

  it("maps query fields when no meta is returned", () => {
    expect(StreamInfoFromTenantVersion({
      ...version,
      query_fields: {name: ["Stream 1"], date: "2026-01-05", title_id: "T1"}
    })).toEqual({versionHash: "hq__1", name: "Stream 1", title: "Stream 1", date: "2026-01-05", titleId: "T1"});
  });

  it("prefers meta values over query fields", () => {
    const info = StreamInfoFromTenantVersion({
      ...version,
      query_fields: {name: "Query name", date: "2026-01-01"},
      meta: {
        public: {name: "Meta title", asset_metadata: {date: "2026-02-02", tags: ["a"]}},
        live_recording_config: {url: "srt://host:1234"}
      }
    });

    expect(info.title).toBe("Meta title");
    expect(info.name).toBe("Query name");
    expect(info.date).toBe("2026-02-02");
    expect(info.tags).toEqual(["a"]);
    expect(info.originUrl).toBe("srt://host:1234");
    expect((info as any).configured).toBe(false);
  });
});
