/** Joins class names, skipping the empty ones. Classes are composed, never overridden: a caller adds layout (margin, flex), not a second colour. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
