import { describe, expect, it } from "vitest";
import { actionLabel, csvCell, dayRange, sanitizeSearch, toCsv, type AuditRow } from "@/lib/audit";

// US-35: audit log page helpers.
describe("audit log", () => {
  it("labels known actions in French and keeps unknown ones", () => {
    expect(actionLabel("auth.login_failed")).toBe("Échec de connexion");
    expect(actionLabel("custom.action")).toBe("custom.action");
  });

  it("turns Tunis days into an inclusive UTC range", () => {
    expect(dayRange("2026-11-01", "2026-11-30")).toEqual({
      gte: "2026-11-01T00:00:00+01:00",
      lt: "2026-11-30T23:00:00.000Z",
    });
    expect(dayRange("", "")).toEqual({});
    expect(dayRange("not-a-date", "")).toEqual({});
  });

  it("removes characters that could change the database filter", () => {
    expect(sanitizeSearch("dr.ben@clinic.tn")).toBe("dr.ben@clinic.tn");
    expect(sanitizeSearch("a%,or(1=1)*")).toBe("aor11");
    expect(sanitizeSearch("x".repeat(300))).toHaveLength(100);
  });

  it("protects CSV cells against formula injection (OWASP)", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("+33")).toBe(`"'+33"`);
    expect(csvCell('a "quote"')).toBe(`"a ""quote"""`);
    expect(csvCell(null)).toBe(`""`);
  });

  it("exports a CSV with a header and one line per entry", () => {
    const row: AuditRow = {
      id: "1",
      created_at: "2026-11-25T10:00:00Z",
      user_email: "admin@medlink.tn",
      action: "auth.logout",
      entity: null,
      entity_id: null,
      severity: "info",
      ip_address: "1.2.3.4",
      details: null,
    };
    const lines = toCsv([row]).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"Date";"Utilisateur"');
    expect(lines[1]).toContain('"Déconnexion"');
  });
});
