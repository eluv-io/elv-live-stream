import { describe, it, expect } from "vitest";
import {
  Slugify,
  VideoBitrateReadable,
  AudioBitrateReadable,
  StreamIsActive,
  Pluralize,
  CheckExpiration,
  MeetsDurationMin,
  IsWithinRetentionPeriod,
  SanitizeUrl,
} from "./helpers";
import { STATUS_MAP } from "./constants";

describe("Slugify", () => {
  it("converts string to lowercase slug", () => {
    expect(Slugify("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(Slugify("Hello@World#123")).toBe("helloworld123");
  });

  it("replaces multiple spaces with single dash", () => {
    expect(Slugify("Hello   World")).toBe("hello-world");
  });

  it("removes leading/trailing whitespace", () => {
    expect(Slugify("  Hello World  ")).toBe("hello-world");
  });

  it("handles empty string", () => {
    expect(Slugify("")).toBe("");
  });

  it("handles null/undefined", () => {
    expect(Slugify(null)).toBe("");
    expect(Slugify(undefined)).toBe("");
  });
});

describe("VideoBitrateReadable", () => {
  it("converts bitrate to Mbps", () => {
    expect(VideoBitrateReadable(5000000)).toBe("5.0Mbps");
  });

  it("handles decimal values", () => {
    expect(VideoBitrateReadable(2500000)).toBe("2.5Mbps");
  });

  it("returns empty string for falsy values", () => {
    expect(VideoBitrateReadable(0)).toBe("");
    expect(VideoBitrateReadable(null)).toBe("");
    expect(VideoBitrateReadable(undefined)).toBe("");
  });
});

describe("AudioBitrateReadable", () => {
  it("converts bitrate to Kbps", () => {
    expect(AudioBitrateReadable(128000)).toBe("128 Kbps");
  });

  it("rounds to nearest integer", () => {
    expect(AudioBitrateReadable(127500)).toBe("128 Kbps");
  });

  it("returns empty string for falsy values", () => {
    expect(AudioBitrateReadable(0)).toBe("");
    expect(AudioBitrateReadable(null)).toBe("");
  });
});

describe("StreamIsActive", () => {
  it("returns true for active states", () => {
    expect(StreamIsActive(STATUS_MAP.STARTING)).toBe(true);
    expect(StreamIsActive(STATUS_MAP.RUNNING)).toBe(true);
    expect(StreamIsActive(STATUS_MAP.STALLED)).toBe(true);
    expect(StreamIsActive(STATUS_MAP.STOPPED)).toBe(true);
  });

  it("returns false for inactive states", () => {
    expect(StreamIsActive(STATUS_MAP.INACTIVE)).toBe(false);
    expect(StreamIsActive(STATUS_MAP.UNINITIALIZED)).toBe(false);
  });
});

describe("Pluralize", () => {
  it("returns singular form for count of 1", () => {
    expect(Pluralize({ base: "item", count: 1 })).toBe("1 item");
  });

  it("returns plural form for count greater than 1", () => {
    expect(Pluralize({ base: "item", count: 2 })).toBe("2 items");
    expect(Pluralize({ base: "item", count: 5 })).toBe("5 items");
  });

  it("returns singular for count of 0", () => {
    expect(Pluralize({ base: "item", count: 0 })).toBe("0 item");
  });

  it("supports custom suffix", () => {
    expect(Pluralize({ base: "child", suffix: "ren", count: 2 })).toBe("2 children");
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

describe("MeetsDurationMin", () => {
  it("returns true when duration is at least 61 seconds", () => {
    const startTime = new Date("2024-01-01T10:00:00Z");
    const endTime = new Date("2024-01-01T10:01:01Z");
    expect(MeetsDurationMin({ startTime, endTime })).toBe(true);
  });

  it("returns false when duration is less than 61 seconds", () => {
    const startTime = new Date("2024-01-01T10:00:00Z");
    const endTime = new Date("2024-01-01T10:01:00Z");
    expect(MeetsDurationMin({ startTime, endTime })).toBe(false);
  });

  it("returns true when endTime is 0 (currently running)", () => {
    const startTime = new Date("2024-01-01T10:00:00Z");
    expect(MeetsDurationMin({ startTime, endTime: 0 })).toBe(true);
  });

  it("returns true when startTime is 0", () => {
    const endTime = new Date("2024-01-01T10:00:00Z");
    expect(MeetsDurationMin({ startTime: 0, endTime })).toBe(true);
  });
});

describe("IsWithinRetentionPeriod", () => {
  it("returns true for persistent streams", () => {
    const result = IsWithinRetentionPeriod({
      startTime: new Date("2020-01-01"),
      persistent: true,
      retention: "3600"
    });
    expect(result).toBe(true);
  });

  it("returns true when within retention period", () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 1800000); // 30 minutes ago
    const result = IsWithinRetentionPeriod({
      startTime,
      persistent: false,
      retention: "3600" // 1 hour retention
    });
    expect(result).toBe(true);
  });

  it("returns false when outside retention period", () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 7200000); // 2 hours ago
    const result = IsWithinRetentionPeriod({
      startTime,
      persistent: false,
      retention: "3600" // 1 hour retention
    });
    expect(result).toBe(false);
  });

  it("returns false for invalid startTime", () => {
    const result = IsWithinRetentionPeriod({
      startTime: null,
      persistent: false,
      retention: "3600"
    });
    expect(result).toBe(false);
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
