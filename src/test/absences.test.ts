import { describe, expect, it } from "vitest";
import { periodError, tunisLocalToIso } from "@/lib/absences";

describe("absences (US-21)", () => {
  it("reads a datetime-local value as Tunis time (UTC+1)", () => {
    expect(tunisLocalToIso("2026-12-24T08:00")).toBe("2026-12-24T07:00:00.000Z");
    expect(tunisLocalToIso("")).toBeNull();
    expect(tunisLocalToIso("24/12/2026 08:00")).toBeNull();
  });

  it("applies the same rules as block_period()", () => {
    const now = Date.parse("2026-12-01T00:00:00Z");
    const ok = periodError("2026-12-24T07:00:00Z", "2026-12-31T19:00:00Z", now);
    expect(ok).toBeNull();
    expect(periodError(null, "2026-12-31T19:00:00Z", now)).toMatch(/Indiquez/);
    expect(periodError("2026-12-24T07:00:00Z", "2026-12-24T06:00:00Z", now)).toMatch(/après/);
    expect(periodError("2026-11-01T07:00:00Z", "2026-11-02T07:00:00Z", now)).toMatch(/passée/);
    expect(periodError("2026-12-02T00:00:00Z", "2027-06-01T00:00:00Z", now)).toMatch(/120 jours/);
  });
});
