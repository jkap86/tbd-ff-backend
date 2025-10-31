/**
 * Escapes special characters in LIKE patterns to prevent wildcard injection
 * Escapes: % (matches any sequence), _ (matches single char), \ (escape char)
 */
export function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, '\\$&');
}
