import { describe, expect, it } from "vitest";
import { parseValues } from "@/lib/result-values";

describe("parseValues (US-25)", () => {
  it("turns 'name = value' lines into an object", () => {
    expect(parseValues("Hémoglobine = 13,2 g/dL\nGlycémie à jeun = 0,92 g/L")).toEqual({
      Hémoglobine: "13,2 g/dL",
      "Glycémie à jeun": "0,92 g/L",
    });
  });

  it("ignores empty or malformed lines and keeps '=' inside the value", () => {
    expect(parseValues("\n= 3\nRapport = A=B\nsans valeur =\nTexte libre")).toEqual({
      Rapport: "A=B",
    });
  });

  it("returns null when nothing was typed", () => {
    expect(parseValues("   ")).toBeNull();
  });
});
