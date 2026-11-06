import { describe, expect, it } from "vitest";
import { buildAppointmentEmail, type AppointmentEmailRow } from "@/lib/appointment-emails";

const row: AppointmentEmailRow = {
  kind: "confirmation",
  first_name: "Ameni",
  starts_at: "2026-11-10T08:00:00Z", // 09:00 in Tunis
  ends_at: "2026-11-10T08:30:00Z",
  practitioner: "Dr Karim Gharbi",
  clinic_name: "MedLink Tunis",
  clinic_address: "Avenue Habib Bourguiba",
  clinic_city: "Tunis",
  clinic_phone: "+216 71 000 000",
};

describe("buildAppointmentEmail (US-08 / US-12)", () => {
  it("confirmation lists practitioner, clinic, date and Tunis time", () => {
    const m = buildAppointmentEmail(row, "https://medlink.tn");
    expect(m.subject).toMatch(/^Confirmation/);
    expect(m.subject).toContain("10 novembre 2026");
    expect(m.text).toContain("Dr Karim Gharbi");
    expect(m.text).toContain("MedLink Tunis");
    expect(m.text).toContain("09:00");
    expect(m.text).toContain("https://medlink.tn/patient/appointments");
  });

  it("reminder has its own subject", () => {
    expect(buildAppointmentEmail({ ...row, kind: "reminder" }).subject).toMatch(/^Rappel/);
  });

  it("escapes HTML coming from the database", () => {
    const m = buildAppointmentEmail({ ...row, first_name: "<script>x</script>" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});
