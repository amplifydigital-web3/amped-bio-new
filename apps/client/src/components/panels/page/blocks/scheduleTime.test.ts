import { describe, expect, it } from "vitest";
import { EXPIRE_ORDER_MESSAGE } from "@repo/constants";
import { FUTURE_MESSAGE, scheduleErrors, utcToZonedWall, zonedWallToUtc } from "./scheduleTime";

// Block settings, Schedule: wall time in the schedule's zone, stored as UTC.

describe("zonedWallToUtc", () => {
  it("reads Lisbon wall time in winter and summer", () => {
    expect(zonedWallToUtc("2026-01-15T20:00", "Europe/Lisbon")).toEqual({
      iso: "2026-01-15T20:00:00.000Z",
      shifted: false,
    });
    expect(zonedWallToUtc("2026-07-15T20:00", "Europe/Lisbon")?.iso).toBe(
      "2026-07-15T19:00:00.000Z"
    );
  });

  it("reads New York wall time on both sides of the November change", () => {
    expect(zonedWallToUtc("2026-10-31T20:00", "America/New_York")?.iso).toBe(
      "2026-11-01T00:00:00.000Z"
    );
    expect(zonedWallToUtc("2026-11-02T20:00", "America/New_York")?.iso).toBe(
      "2026-11-03T01:00:00.000Z"
    );
  });

  it("takes the first occurrence of a repeated time (fall back)", () => {
    // 1:30 AM happens twice on 1 Nov 2026 in New York; the first is EDT
    expect(zonedWallToUtc("2026-11-01T01:30", "America/New_York")?.iso).toBe(
      "2026-11-01T05:30:00.000Z"
    );
  });

  it("moves a time that does not exist to the next valid minute (spring forward)", () => {
    // 2:30 AM does not exist on 8 Mar 2026 in New York; 3:00 AM EDT does
    expect(zonedWallToUtc("2026-03-08T02:30", "America/New_York")).toEqual({
      iso: "2026-03-08T07:00:00.000Z",
      shifted: true,
    });
    // Lisbon skips 1:00 to 2:00 on 29 Mar 2026
    expect(zonedWallToUtc("2026-03-29T01:15", "Europe/Lisbon")).toEqual({
      iso: "2026-03-29T01:00:00.000Z",
      shifted: true,
    });
  });

  it("does not use the browser offset", () => {
    const lisbon = zonedWallToUtc("2026-11-06T20:00", "Europe/Lisbon")?.iso;
    const newYork = zonedWallToUtc("2026-11-06T20:00", "America/New_York")?.iso;
    expect(lisbon).toBe("2026-11-06T20:00:00.000Z");
    expect(newYork).toBe("2026-11-07T01:00:00.000Z");
  });

  it("rejects input that is not a date and time", () => {
    expect(zonedWallToUtc("", "Europe/Lisbon")).toBeNull();
    expect(zonedWallToUtc("2026-02-31T10:00", "Europe/Lisbon")).toBeNull();
  });
});

describe("utcToZonedWall", () => {
  it("shows UTC as wall time in the zone, and round trips", () => {
    expect(utcToZonedWall("2026-07-15T19:00:00.000Z", "Europe/Lisbon")).toBe("2026-07-15T20:00");
    expect(utcToZonedWall("2026-11-01T05:30:00.000Z", "America/New_York")).toBe("2026-11-01T01:30");
    expect(utcToZonedWall("2026-11-01T06:30:00.000Z", "America/New_York")).toBe("2026-11-01T01:30");
    expect(utcToZonedWall("2026-03-08T07:00:00.000Z", "America/New_York")).toBe("2026-03-08T03:00");
    expect(utcToZonedWall("2026-01-01T00:00:00.000Z", "America/New_York")).toBe("2025-12-31T19:00");
  });
});

describe("scheduleErrors", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");

  it("needs Expire after Go live", () => {
    expect(scheduleErrors("2026-11-10T20:00", "2026-11-09T20:00", "Europe/Lisbon", now)).toEqual({
      end: EXPIRE_ORDER_MESSAGE,
    });
  });

  it("needs Expire in the future", () => {
    expect(scheduleErrors("", "2026-11-05T20:00", "Europe/Lisbon", now)).toEqual({
      end: FUTURE_MESSAGE,
    });
  });

  it("allows a Go live in the past", () => {
    expect(scheduleErrors("2026-11-01T20:00", "2026-11-09T20:00", "Europe/Lisbon", now)).toEqual(
      {}
    );
  });

  it("reads the times in the zone given", () => {
    // 8 PM in New York is after 9 PM in Lisbon on the same day
    expect(
      scheduleErrors("2026-11-10T21:00", "2026-11-10T20:00", "America/New_York", now).end
    ).toBe(EXPIRE_ORDER_MESSAGE);
  });
});
