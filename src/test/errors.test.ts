import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/errors";

describe("friendlyError", () => {
  it("maps Supabase auth codes", () => {
    expect(friendlyError({ code: "over_email_send_rate_limit", message: "x" })).toMatch(
      /Trop d'e-mails/,
    );
    expect(friendlyError({ code: "user_already_exists", message: "x" })).toMatch(/existe déjà/);
    expect(friendlyError({ code: "weak_password", message: "x" })).toMatch(/trop faible/);
  });
  it("maps database and network errors without leaking raw text", () => {
    expect(friendlyError({ message: "Database error saving new user" })).toMatch(/indisponible/);
    expect(friendlyError(new Error("Failed to fetch"))).toMatch(/Connexion au serveur/);
    expect(friendlyError({ message: "SLOT_OVERLAP" })).toMatch(/chevauche/);
  });

  it("explains a double booking (same time, any clinic)", () => {
    const msg = /déjà un rendez-vous à ce moment-là/;
    expect(friendlyError({ message: "PATIENT_BUSY" })).toMatch(msg);
    expect(
      friendlyError({
        message:
          'conflicting key value violates exclusion constraint "appointments_patient_no_overlap"',
      }),
    ).toMatch(msg);
  });
});
