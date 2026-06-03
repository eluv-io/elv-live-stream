import { describe, it, expect } from "vitest";
import {CheckExpiration, SanitizeUrl, SortTable} from "@/utils/helpers.ts";

describe("SortTable", () => {
  const asc = {columnAccessor: "name", direction: "asc"};
  const desc = {columnAccessor: "name", direction: "desc"};

  it("sorts strings ascending", () => {
    const sorter = SortTable({sortStatus: asc});
    expect(sorter({name: "banana"}, {name: "apple"})).toBeGreaterThan(0);
    expect(sorter({name: "apple"}, {name: "banana"})).toBeLessThan(0);
  });

  it("sorts strings descending", () => {
    const sorter = SortTable({sortStatus: desc});
    expect(sorter({name: "apple"}, {name: "banana"})).toBeGreaterThan(0);
  });

  it("returns 0 for equal values", () => {
    const sorter = SortTable({sortStatus: asc});
    expect(sorter({name: "apple"}, {name: "apple"})).toBe(0);
  });

  it("trims and lowercases strings before comparing", () => {
    const sorter = SortTable({sortStatus: asc});
    expect(sorter({name: "  Apple  "}, {name: "apple"})).toBe(0);
  });

  it("sorts numbers", () => {
    const sorter = SortTable({sortStatus: {columnAccessor: "count", direction: "asc"}});
    expect(sorter({count: 1}, {count: 2})).toBeLessThan(0);
    expect(sorter({count: 2}, {count: 1})).toBeGreaterThan(0);
    expect(sorter({count: 5}, {count: 5})).toBe(0);
  });

  it("treats NaN as 0 when sorting numbers", () => {
    const sorter = SortTable({sortStatus: {columnAccessor: "count", direction: "asc"}});
    expect(sorter({count: NaN}, {count: 0})).toBe(0);
  });

  it("falls back to empty string for null/undefined values", () => {
    const sorter = SortTable({sortStatus: asc});
    expect(sorter({name: null}, {name: "apple"})).toBeLessThan(0);
    expect(sorter({name: undefined}, {name: "apple"})).toBeLessThan(0);
  });

  it("uses AdditionalCondition when it returns a defined value", () => {
    const sorter = SortTable({
      sortStatus: asc,
      AdditionalCondition: (a, b) => b.priority - a.priority
    });
    expect(sorter({name: "apple", priority: 2}, {name: "banana", priority: 1})).toBeLessThan(0);
  });

  it("falls through AdditionalCondition when it returns undefined", () => {
    const sorter = SortTable({
      sortStatus: asc,
      AdditionalCondition: () => undefined
    });
    expect(sorter({name: "banana"}, {name: "apple"})).toBeGreaterThan(0);
  });
});

describe("CheckExpiration", () => {
  it("returns false for future dates", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(CheckExpiration(tomorrow.getTime())).toBe(false);
  });

  it("returns true for past dates", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(CheckExpiration(yesterday.getTime())).toBe(true);
  });

  it("returns false for today", () => {
    const today = new Date();
    expect(CheckExpiration(today.getTime())).toBe(false);
  });

  it("returns false for non-number input", () => {
    expect(CheckExpiration("not a number")).toBe(false);
    expect(CheckExpiration(null)).toBe(false);
  });
});

describe("SanitizeUrl", () => {
  it("removes passphrase from URL", () => {
    const url = "https://example.com?passphrase=secret&other=value";
    const result = SanitizeUrl({ url });
    expect(result).toBe("https://example.com/?other=value");
  });

  it("removes additional query params", () => {
    const url = "https://example.com?token=abc&passphrase=secret&keep=this";
    const result = SanitizeUrl({ url, removeQueryParams: ["token"] });
    expect(result).toBe("https://example.com/?keep=this");
  });

  it("handles URLs without query params", () => {
    const url = "https://example.com/path";
    const result = SanitizeUrl({ url });
    expect(result).toBe("https://example.com/path");
  });

  it("returns empty string for empty input", () => {
    expect(SanitizeUrl({ url: "" })).toBe("");
    expect(SanitizeUrl({ url: null })).toBe("");
  });

  it("returns empty string for invalid URLs", () => {
    const result = SanitizeUrl({ url: "not a valid url" });
    expect(result).toBe("");
  });

  it("strips passphrase from URLs with out-of-range ports via regex fallback", () => {
    const url = "rtp://host:99999?passphrase=secret&other=value";
    const result = SanitizeUrl({ url });
    expect(result).not.toContain("passphrase");
    expect(result).toContain("other=value");
  });

  it("strips extra params from URLs with out-of-range ports via regex fallback", () => {
    const url = "rtp://host:99999?token=abc&passphrase=secret";
    const result = SanitizeUrl({ url, removeQueryParams: ["token"] });
    expect(result).not.toContain("passphrase");
    expect(result).not.toContain("token");
  });
});
