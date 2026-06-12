import {describe, expect, it} from "vitest";
import {MeetsDurationMin, IsWithinRetentionPeriod, RecordingPeriodIsExpired} from "@/utils/recording";

describe("MeetsDurationMin", () => {
  it("returns true when duration is at least 61 seconds", () => {
    const startTime = new Date("2024-01-01T10:00:00Z").getTime();
    const endTime = new Date("2024-01-01T10:01:01Z").getTime();
    expect(MeetsDurationMin({ startTime, endTime })).toBe(true);
  });

  it("returns false when duration is less than 61 seconds", () => {
    const startTime = new Date("2024-01-01T10:00:00Z").getTime();
    const endTime = new Date("2024-01-01T10:01:00Z").getTime();
    expect(MeetsDurationMin({ startTime, endTime })).toBe(false);
  });

  it("returns true when endTime is 0 (currently running)", () => {
    const startTime = new Date("2024-01-01T10:00:00Z").getTime();
    expect(MeetsDurationMin({ startTime, endTime: 0 })).toBe(true);
  });

  it("returns true when startTime is 0", () => {
    const endTime = new Date("2024-01-01T10:00:00Z").getTime();
    expect(MeetsDurationMin({ startTime: 0, endTime })).toBe(true);
  });
});

describe("IsWithinRetentionPeriod", () => {
  it("returns true for persistent streams", () => {
    const result = IsWithinRetentionPeriod({
      startTime: new Date("2020-01-01").getTime(),
      persistent: true,
      retention: "3600"
    });
    expect(result).toBe(true);
  });

  it("returns true when within retention period", () => {
    const startTime = Date.now() - 1800000; // 30 minutes ago
    const result = IsWithinRetentionPeriod({
      startTime,
      persistent: false,
      retention: "3600" // 1 hour retention
    });
    expect(result).toBe(true);
  });

  it("returns false when outside retention period", () => {
    const startTime = Date.now() - 7200000; // 2 hours ago
    const result = IsWithinRetentionPeriod({
      startTime,
      persistent: false,
      retention: "3600" // 1 hour retention
    });
    expect(result).toBe(false);
  });

  it("returns false when retention is not provided", () => {
    const startTime = Date.now() - 1800000;
    const result = IsWithinRetentionPeriod({startTime, persistent: false, retention: ""});
    expect(result).toBe(false);
  });

  it("returns false for invalid startTime", () => {
    const result = IsWithinRetentionPeriod({
      startTime: "not-a-date",
      persistent: false,
      retention: "3600"
    });
    expect(result).toBe(false);
  });
});

describe("RecordingPeriodIsExpired", () => {
  const now = Date.now();
  const recentStart = now - 1800000; // 30 min ago
  const oldStart = now - 7200000;    // 2 hours ago
  const longEnd = now - 1700000;     // 28 min ago (62s after recentStart)
  const shortEnd = now - 1799000;    // 1s after recentStart
  const retention = "3600"; // 1 hour

  it("returns true when parts is empty", () => {
    expect(RecordingPeriodIsExpired({
      parts: [],
      startTime: recentStart,
      endTime: longEnd,
      retention
    })).toBe(true);
  });

  it("returns true when duration is too short (under 61 seconds)", () => {
    expect(RecordingPeriodIsExpired({
      parts: ["part"],
      startTime: recentStart,
      endTime: shortEnd,
      retention
    })).toBe(true);
  });

  it("returns true when outside retention period", () => {
    expect(RecordingPeriodIsExpired({
      parts: ["part"],
      startTime: oldStart,
      endTime: oldStart + 62000,
      retention
    })).toBe(true);
  });

  it("returns false when parts are present, duration meets minimum, and within retention", () => {
    expect(RecordingPeriodIsExpired({
      parts: ["part"],
      startTime: recentStart,
      endTime: longEnd,
      retention
    })).toBe(false);
  });
});
