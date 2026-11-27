export function detectXss(input: string): boolean {
  const patterns = [
    /<script\b/i,
    /<[^>]+\bon\w+\s*=/i,
    /javascript\s*:/i,
    /<iframe\b/i,
    /<svg\b[^>]*\bonload\s*=/i,
  ];

  return patterns.some((pattern) => pattern.test(input));
}
