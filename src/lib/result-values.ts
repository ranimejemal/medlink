// US-25: the practitioner types one value per line, "name = value".
/** "Hémoglobine = 13,2 g/dL" lines become {"Hémoglobine": "13,2 g/dL"}. */
export function parseValues(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v) out[k.slice(0, 100)] = v.slice(0, 200);
  }
  return Object.keys(out).length ? out : null;
}
