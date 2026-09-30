/**
 * Converting between the urge form's emotion chips and the stored text. Several chips can
 * be chosen; anything else goes in "Other". The choice is stored as plain comma-separated
 * text in `emotionBefore`, so older free-text records and imports stay compatible, and a
 * chip removed from the list later still shows (as "Other") on records that used it.
 *
 * `options` is the user's current chip list (see data/emotions.ts).
 */

/** Max length of the stored text (matches the database column). */
export const EMOTION_MAX_LENGTH = 255;

/**
 * Splits stored text into chips from `options` and leftover free text, e.g.
 * "Shame, unhappy, guilt, because of a post" -> { selected: [Shame, Guilt, Unhappy], other: "because of a post" }.
 */
export function parseEmotions(
  text: string | null | undefined,
  options: readonly string[],
): { selected: string[]; other: string } {
  const canonical = new Map(options.map((e) => [e.toLowerCase(), e]));
  const selected = new Set<string>();
  const other: string[] = [];
  for (const part of (text ?? '').split(',')) {
    const p = part.trim();
    if (!p) continue;
    const known = canonical.get(p.toLowerCase());
    if (known) selected.add(known);
    else other.push(p);
  }
  return { selected: options.filter((e) => selected.has(e)), other: other.join(', ') };
}

/** Joins selected chips (in list order) and the "Other" text; null if nothing chosen. */
export function formatEmotions(selected: readonly string[], other: string, options: readonly string[]): string | null {
  const chips = options.filter((e) => selected.includes(e));
  const extra = other.trim();
  const text = [...chips, ...(extra ? [extra] : [])].join(', ');
  return text ? text.slice(0, EMOTION_MAX_LENGTH) : null;
}
