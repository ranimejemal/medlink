import { describe, expect, it } from "vitest";
import { closedMessage, isPortalOpen, tunisHour } from "@/lib/portal-hours";

// US-49: the portal books appointments from 6:00 to 22:00, Tunis time (UTC+1).
describe("portal opening hours", () => {
  it("uses Tunis time, not the browser time", () => {
    expect(tunisHour(new Date("2026-11-25T04:30:00Z"))).toBe(5);
    expect(tunisHour(new Date("2026-07-01T21:00:00Z"))).toBe(22); // no summer time in Tunisia
  });

  it("is open from 6:00 to 21:59", () => {
    expect(isPortalOpen(new Date("2026-11-25T04:59:00Z"))).toBe(false); // 05:59
    expect(isPortalOpen(new Date("2026-11-25T05:00:00Z"))).toBe(true); // 06:00
    expect(isPortalOpen(new Date("2026-11-25T20:59:00Z"))).toBe(true); // 21:59
    expect(isPortalOpen(new Date("2026-11-25T21:00:00Z"))).toBe(false); // 22:00
  });

  it("is always open when the administrator switches the rule off", () => {
    const night = new Date("2026-11-25T01:00:00Z");
    expect(isPortalOpen(night, { open_hour: 6, close_hour: 22, enabled: false })).toBe(true);
  });

  it("explains the hours", () => {
    expect(closedMessage()).toContain("de 6 h à 22 h");
  });
});
