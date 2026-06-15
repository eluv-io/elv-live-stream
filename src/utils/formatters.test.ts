import {describe, expect, it} from "vitest";
import {
  VideoBitrateReadable,
  AudioBitrateReadable,
  SampleRateReadable,
  FormatTime,
  Pluralize,
  DateFormat,
  BytesToMb,
  RelativeTime
} from "@/utils/formatters";

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

describe("SampleRateReadable", () => {
  it("converts sample rate to kHz", () => {
    expect(SampleRateReadable(44100)).toBe("44 kHz");
    expect(SampleRateReadable(48000)).toBe("48 kHz");
  });

  it("returns empty string for falsy values", () => {
    expect(SampleRateReadable(0)).toBe("");
    expect(SampleRateReadable(null)).toBe("");
  });
});

describe("FormatTime", () => {
  const oneHourOneMinOneSecMs = 3661000; // 1h 1min 1sec

  it("returns hh,mm,ss format by default", () => {
    expect(FormatTime({milliseconds: oneHourOneMinOneSecMs})).toBe("1h 1min 1sec");
  });

  it("returns hh:mm:ss format when requested", () => {
    expect(FormatTime({milliseconds: oneHourOneMinOneSecMs, format: "hh:mm:ss"})).toBe("01:01:01");
  });

  it("pads hours and minutes to two digits in hh:mm:ss", () => {
    expect(FormatTime({milliseconds: 3600000, format: "hh:mm:ss"})).toBe("01:00:00");
  });

  it("returns hh,mm format when requested", () => {
    expect(FormatTime({milliseconds: oneHourOneMinOneSecMs, format: "hh,mm"})).toBe("1h 1min");
  });

  it("accepts an iso string and converts it", () => {
    const iso = new Date(oneHourOneMinOneSecMs).toISOString();
    expect(FormatTime({iso})).toBe("1h 1min 1sec");
  });

  it("returns empty string for falsy milliseconds", () => {
    expect(FormatTime({milliseconds: 0})).toBe("");
    expect(FormatTime({milliseconds: null})).toBe("");
  });

  it("falls back to hh,mm when an unrecognized format is passed", () => {
    expect(FormatTime({milliseconds: 3661000, format: "unknown"})).toBe("1h 1min");
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

describe("DateFormat", () => {
  const knownSec = 1700000000; // seconds since epoch
  const knownMs = knownSec * 1000;
  const knownIso = new Date(knownMs).toISOString();

  it("formats a unix timestamp in seconds by default", () => {
    const result = DateFormat({time: knownSec});
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats a unix timestamp in milliseconds", () => {
    const resultSec = DateFormat({time: knownSec, format: "sec"});
    const resultMs = DateFormat({time: knownMs, format: "ms"});
    expect(resultSec).toBe(resultMs);
  });

  it("formats an ISO string", () => {
    const resultIso = DateFormat({time: knownIso, format: "iso"});
    const resultMs = DateFormat({time: knownMs, format: "ms"});
    expect(resultIso).toBe(resultMs);
  });
});

describe("BytesToMb", () => {
  it("returns 0 MB for falsy input", () => {
    expect(BytesToMb(0)).toBe("0 MB");
    expect(BytesToMb(null)).toBe("0 MB");
    expect(BytesToMb(undefined)).toBe("0 MB");
  });

  it("converts bytes to MB", () => {
    expect(BytesToMb(1_000_000)).toContain("1");
    expect(BytesToMb(1_000_000)).toContain("MB");
  });

  it("rounds to at most 2 decimal places", () => {
    const result = BytesToMb(1_500_000);
    expect(result).toContain("1.5");
    expect(result).toContain("MB");
  });
});

describe("RelativeTime", () => {
  it("returns empty string for falsy input", () => {
    expect(RelativeTime(null)).toBe("");
    expect(RelativeTime(undefined)).toBe("");
    expect(RelativeTime("")).toBe("");
  });

  it("returns a seconds-based string for times within a minute", () => {
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    const result = RelativeTime(thirtySecondsAgo);
    expect(result).toMatch(/second/);
  });

  it("returns a minutes-based string for times within an hour", () => {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60_000).toISOString();
    const result = RelativeTime(twentyMinutesAgo);
    expect(result).toMatch(/minute/);
  });

  it("returns an hours-based string for times within a day", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const result = RelativeTime(threeHoursAgo);
    expect(result).toMatch(/hour/);
  });

  it("returns a days-based string for times older than a day", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const result = RelativeTime(threeDaysAgo);
    expect(result).toMatch(/day/);
  });
});
