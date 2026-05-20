import {describe, expect, it} from "vitest";
import {MeetsDurationMin, IsWithinRetentionPeriod, RecordingPeriodIsExpired} from "@/utils/recording.js";

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

  it("returns false when retention is not provided", () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 1800000);
    const result = IsWithinRetentionPeriod({startTime, persistent: false, retention: undefined});
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
  const now = new Date();
  const recentStart = new Date(now.getTime() - 1800000).toISOString(); // 30 min ago
  const oldStart = new Date(now.getTime() - 7200000).toISOString();    // 2 hours ago
  const longEnd = new Date(now.getTime() - 1700000).toISOString();     // 28 min ago (62s after recentStart)
  const shortEnd = new Date(now.getTime() - 1799000).toISOString();    // 1s after recentStart
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
      parts: [{}],
      startTime: recentStart,
      endTime: shortEnd,
      retention
    })).toBe(true);
  });

  it("returns true when outside retention period", () => {
    const endAfterOld = new Date(new Date(oldStart).getTime() + 62000).toISOString();
    expect(RecordingPeriodIsExpired({
      parts: [{}],
      startTime: oldStart,
      endTime: endAfterOld,
      retention
    })).toBe(true);
  });

  it("returns false when parts are present, duration meets minimum, and within retention", () => {
    expect(RecordingPeriodIsExpired({
      parts: [{}],
      startTime: recentStart,
      endTime: longEnd,
      retention
    })).toBe(false);
  });
});