export function detectSqlInjection(input: string): boolean {
  const patterns = [
    /'\s*or\s+'[^']+'\s*=\s*'[^']+/i,
    /\bunion\s+(?:all\s+)?select\b/i,
    /;\s*(?:drop|delete|update|insert)\b/i,
    /(?:--|#)\s*$/m,
  ];

  return patterns.some((pattern) => pattern.test(input));
}
