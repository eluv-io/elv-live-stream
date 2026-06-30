import {describe, expect, it} from "vitest";
import {ParseLiveConfigData, StreamIsActive, DeriveSourceAndPackaging, StatusColor, LiveRecordingConfigProfile} from "@/utils/stream";
import {STATUS_MAP} from "@/utils/constants";

describe("ParseLiveConfigData", () => {
  const mockProfile: LiveRecordingConfigProfile = {
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
      const result = ParseLiveConfigData({copyMpegTs: true, copyMode: "raw", inputPackaging: "raw_ts"});
      expect(result.recording_config.input_cfg).toEqual({
        bypass_libav_reader: true,
        copy_mode: "raw",
        copy_packaging: "raw_ts",
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

describe("StatusColor", () => {
  it("returns orange for stopped state", () => {
    expect(StatusColor(STATUS_MAP.STOPPED)).toBe("elv-orange.6");
  });

  it("returns green for running state", () => {
    expect(StatusColor(STATUS_MAP.RUNNING)).toBe("elv-green.5");
  });

  it("returns red for inactive, unitialized, and stalled states", () => {
    expect(StatusColor(STATUS_MAP.INACTIVE)).toBe("elv-red.4");
    expect(StatusColor(STATUS_MAP.UNINITIALIZED)).toBe("elv-red.4");
    expect(StatusColor(STATUS_MAP.STALLED)).toBe("elv-red.4");
  });

  it("returns yellow for degraded state", () => {
    expect(StatusColor(STATUS_MAP.DEGRADED)).toBe("elv-yellow.6");
  });

  it("returns empty string for unknown status", () => {
    expect(StatusColor("")).toBe("");
  });
});

describe("DeriveSourceAndPackaging", () => {
  describe("source by protocol", () => {
    it("sets source to [srt] for srt:// URLs with no inputCfg", () => {
      const {source} = DeriveSourceAndPackaging({url: "srt://host:1234"});
      expect(source).toEqual(["srt"]);
    });

    it("appends ts for srt:// URLs when copy_packaging is set", () => {
      const {source} = DeriveSourceAndPackaging({
        url: "srt://host:1234",
        inputCfg: {copy_packaging: "rtp_ts"}
      });
      expect(source).toEqual(["srt", "ts"]);
    });

    it("appends rtp for srt:// URLs when input_packaging includes rtp", () => {
      const {source} = DeriveSourceAndPackaging({
        url: "srt://host:1234",
        inputCfg: {input_packaging: ["rtp"]}
      });
      expect(source).toEqual(["srt", "rtp"]);
    });

    it("sets source to [ts] for udp:// URLs", () => {
      const {source} = DeriveSourceAndPackaging({url: "udp://239.0.0.1:5000"});
      expect(source).toEqual(["ts"]);
    });

    it("sets source to [rtp, ts] for rtp:// URLs", () => {
      const {source} = DeriveSourceAndPackaging({url: "rtp://239.0.0.1:5000"});
      expect(source).toEqual(["rtp", "ts"]);
    });

    it("sets source to [rtmp] for rtmp:// URLs", () => {
      const {source} = DeriveSourceAndPackaging({url: "rtmp://stream.example.com/live"});
      expect(source).toEqual(["rtmp"]);
    });

    it("leaves source undefined for unknown protocols", () => {
      const {source} = DeriveSourceAndPackaging({url: "https://example.com"});
      expect(source).toBeUndefined();
    });

    it("leaves source undefined when url is null", () => {
      const {source} = DeriveSourceAndPackaging({url: null});
      expect(source).toBeUndefined();
    });
  });

  describe("packaging", () => {
    it("includes only fmp4 when no inputCfg is provided", () => {
      const {packaging} = DeriveSourceAndPackaging({url: "srt://host:1234"});
      expect(packaging).toEqual(["fmp4"]);
    });

    it("adds rtp when copy_packaging is rtp_ts", () => {
      const {packaging} = DeriveSourceAndPackaging({
        url: "srt://host:1234",
        inputCfg: {copy_packaging: "rtp_ts"}
      });
      expect(packaging).toContain("rtp");
    });

    it("adds ts and fmp4 when copy_mode is raw", () => {
      const {packaging} = DeriveSourceAndPackaging({
        url: "srt://host:1234",
        inputCfg: {copy_mode: "raw"}
      });
      expect(packaging).toEqual(["ts", "fmp4"]);
    });

    it("adds ts but not fmp4 when copy_mode is raw_only", () => {
      const {packaging} = DeriveSourceAndPackaging({
        url: "srt://host:1234",
        inputCfg: {copy_mode: "raw_only"}
      });
      expect(packaging).toEqual(["ts"]);
    });

    it("combines rtp, ts, fmp4 when copy_packaging is rtp_ts and copy_mode is raw", () => {
      const {packaging} = DeriveSourceAndPackaging({
        url: "srt://host:1234",
        inputCfg: {copy_packaging: "rtp_ts", copy_mode: "raw"}
      });
      expect(packaging).toEqual(["rtp", "ts", "fmp4"]);
    });
  });
});
