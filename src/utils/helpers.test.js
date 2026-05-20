import { describe, it, expect } from "vitest";
import {CheckExpiration, SanitizeUrl} from "./helpers";

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

  it("returns false for invalid URLs", () => {
    const result = SanitizeUrl({ url: "not a valid url" });
    expect(result).toBe(false);
  });
});
