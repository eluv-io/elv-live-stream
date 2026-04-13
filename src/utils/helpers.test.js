import { describe, it, expect } from "vitest";
import {
  VideoBitrateReadable,
  AudioBitrateReadable,
  StreamIsActive,
  Pluralize,
  CheckExpiration,
  MeetsDurationMin,
  IsWithinRetentionPeriod,
  SanitizeUrl,
  ParseLiveConfigData,
} from "./helpers";
import { STATUS_MAP } from "./constants";

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

describe("ParseLiveConfigData", () => {
  const mockProfile = {
    name: "Test Profile",
    recording_config: {part_ttl: 3600},
    playout_config: {playout_formats: ["hls-clear"]},
    recording_stream_config: {audio: {0: {record: true}}},
    input_stream_info: {streams: []},
    recording_params: {xc_params: {video_bitrate: 9500000}}
  };

  describe("configProfile branch", () => {
    it("returns profile fields when configProfile is provided", () => {
      const result = ParseLiveConfigData({configProfile: mockProfile});
      expect(result.name).toBe("Test Profile");
      expect(result.recording_config).toEqual({part_ttl: 3600});
      expect(result.playout_config).toEqual({playout_formats: ["hls-clear"]});
      expect(result.recording_stream_config).toEqual({audio: {0: {record: true}}});
      expect(result.input_stream_info).toEqual({streams: []});
      expect(result.recording_params).toEqual({xc_params: {video_bitrate: 9500000}});
    });

    it("overrides recording_stream_config with audioFormData when provided", () => {
      const audioFormData = {1: {record: true, codec: "aac"}};
      const result = ParseLiveConfigData({configProfile: mockProfile, audioFormData});
      expect(result.recording_stream_config).toEqual({audio: audioFormData});
    });

    it("falls back to null for missing profile fields", () => {
      const result = ParseLiveConfigData({configProfile: {name: "Minimal"}});
      expect(result.recording_config).toBeNull();
      expect(result.playout_config).toBeNull();
      expect(result.recording_stream_config).toBeNull();
      expect(result.input_stream_info).toBeNull();
      expect(result.recording_params).toBeNull();
    });
  });

  describe("overrides branch", () => {
    it("returns recording_config with parsed values", () => {
      const result = ParseLiveConfigData({retention: "7200", connectionTimeout: "30", reconnectionTimeout: 60});
      expect(result.recording_config.part_ttl).toBe(7200);
      expect(result.recording_config.connection_timeout).toBe(30);
      expect(result.recording_config.reconnect_timeout).toBe(60);
    });

    it("leaves undefined fields as undefined in recording_config", () => {
      const result = ParseLiveConfigData({});
      expect(result.recording_config.part_ttl).toBeUndefined();
      expect(result.recording_config.connection_timeout).toBeUndefined();
    });

    it("includes dvr config when dvrEnabled is provided and skipDvrSection is false", () => {
      const result = ParseLiveConfigData({dvrEnabled: true, dvrMaxDuration: "3600", dvrStartTime: "2024-01-01T00:00:00Z"});
      expect(result.playout_config.dvr).toBe(true);
      expect(result.playout_config.dvr_max_duration).toBe(3600);
      expect(result.playout_config.dvr_start_time).toBe("2024-01-01T00:00:00.000Z");
    });

    it("omits dvr_start_time and dvr_max_duration when dvrEnabled is false", () => {
      const result = ParseLiveConfigData({dvrEnabled: false});
      expect(result.playout_config.dvr).toBe(false);
      expect(result.playout_config.dvr_start_time).toBeUndefined();
      expect(result.playout_config.dvr_max_duration).toBeUndefined();
    });

    it("skips dvr config when skipDvrSection is true", () => {
      const result = ParseLiveConfigData({dvrEnabled: true, skipDvrSection: true});
      expect(result.playout_config.dvr).toBeUndefined();
    });

    it("builds inputCfg when copyMpegTs is true", () => {
      const result = ParseLiveConfigData({copyMpegTs: true, copyMode: "raw", inputPackaging: "raw_ts", customReadLoop: false});
      expect(result.recording_config.input_cfg).toEqual({
        bypass_libav_reader: true,
        copy_mode: "raw",
        copy_packaging: "raw_ts",
        custom_read_loop_enabled: false,
        input_packaging: "raw_ts"
      });
    });

    it("resets inputCfg to empty object when copyMpegTs is false", () => {
      const result = ParseLiveConfigData({copyMpegTs: false});
      expect(result.recording_config.input_cfg).toEqual({});
    });

    it("sets inputCfg to undefined when copyMpegTs is undefined", () => {
      const result = ParseLiveConfigData({});
      expect(result.recording_config.input_cfg).toBeUndefined();
    });

    it("sets recording_stream_config from audioFormData", () => {
      const audioFormData = {0: {record: true}};
      const result = ParseLiveConfigData({audioFormData});
      expect(result.recording_stream_config).toEqual({audio: audioFormData});
    });

    it("sets recording_stream_config to null when no audioFormData", () => {
      const result = ParseLiveConfigData({});
      expect(result.recording_stream_config).toBeNull();
    });

    it("does not include name, input_stream_info, or recording_params", () => {
      const result = ParseLiveConfigData({retention: "3600"});
      expect(result).not.toHaveProperty("name");
      expect(result).not.toHaveProperty("input_stream_info");
      expect(result).not.toHaveProperty("recording_params");
    });
  });
});
