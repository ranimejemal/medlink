// Normalise en format international (E.164).
// Sans indicatif : numéro mobile tunisien à 8 chiffres (commençant par 2, 4, 5 ou 9) => +216.
export function normalizePhone(input: string): string | null {
  const raw = input.trim().replace(/[\s().-]/g, "");
  if (!raw) return null;
  const intl = /^\+[1-9]\d{7,14}$/;
  if (raw.startsWith("+")) return intl.test(raw) ? raw : null;
  if (raw.startsWith("00")) {
    const p = "+" + raw.slice(2);
    return intl.test(p) ? p : null;
  }
  if (/^[2459]\d{7}$/.test(raw)) return "+216" + raw;
  return null;
}
