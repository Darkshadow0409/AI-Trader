import { describe, expect, it } from "vitest";
import { formatDateTimeIST, formatTimeIST, parseTimestampMs } from "./time";

describe("time formatting", () => {
  it("formats timestamps explicitly in IST", () => {
    expect(formatTimeIST("2026-03-15T11:30:00Z")).toMatch(/IST$/);
    expect(formatDateTimeIST("2026-03-15T11:30:00Z")).toMatch(/IST$/);
  });

  it("treats naive backend timestamps as UTC", () => {
    expect(formatTimeIST("2026-03-21T14:00:00")).toBe("19:30:00 IST");
  });

  it("handles malformed timestamps safely", () => {
    expect(parseTimestampMs("bad-timestamp")).toBeNull();
    expect(formatDateTimeIST("bad-timestamp")).toBe("n/a");
  });
});
