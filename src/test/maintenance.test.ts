import { describe, expect, it } from "vitest";
import { isValidMaintenancePeriod } from "@/lib/maintenance-validation";

describe("US-38 — Maintenance annoncée", () => {
  it("accepte une période valide", () => {
    expect(isValidMaintenancePeriod("2026-11-15T22:00", "2026-11-15T23:00")).toBe(true);
  });

  it("refuse une date de fin avant le début", () => {
    expect(isValidMaintenancePeriod("2026-11-15T23:00", "2026-11-15T22:00")).toBe(false);
  });

  it("refuse une date de fin égale au début", () => {
    expect(isValidMaintenancePeriod("2026-11-15T22:00", "2026-11-15T22:00")).toBe(false);
  });

  it("refuse une date invalide", () => {
    expect(isValidMaintenancePeriod("date-invalide", "2026-11-15T23:00")).toBe(false);
  });
});
