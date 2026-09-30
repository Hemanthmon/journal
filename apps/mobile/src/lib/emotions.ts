/**
 * Emotions offered as quick-select chips in the urge form. Several can be chosen; anything
 * else goes in "Other". The choice is stored as plain comma-separated text in
 * `emotionBefore`, so older free-text records and imports stay compatible.
 */
export const EMOTIONS = [
  'Bored',
  'Lonely',
  'Stressed',
  'Anxious',
  'Sad',
  'Tired',
  'Restless',
  'Curious',
  'Overthinking',
  'Angry',
  'Frustrated',
  'Shame',
  'Guilt',
  'Fear',
  'Unhappy',
  'Numb',
] as const;

/** Max length of the stored text (matches the database column). */
export const EMOTION_MAX_LENGTH = 255;

const canonical = new Map(EMOTIONS.map((e) => [e.toLowerCase(), e]));

/**
 * Splits stored text into known chips and leftover free text, e.g.
 * "Shame, unhappy, guilt, because of a post" -> { selected: [Shame, Guilt, Unhappy], other: "because of a post" }.
 */
export function parseEmotions(text: string | null | undefined): { selected: string[]; other: string } {
  const selected = new Set<string>();
  const other: string[] = [];
  for (const part of (text ?? '').split(',')) {
    const p = part.trim();
    if (!p) continue;
    const known = canonical.get(p.toLowerCase());
    if (known) selected.add(known);
    else other.push(p);
  }
  return { selected: EMOTIONS.filter((e) => selected.has(e)), other: other.join(', ') };
}

/** Joins selected chips (in list order) and the "Other" text; null if nothing chosen. */
export function formatEmotions(selected: readonly string[], other: string): string | null {
  const chips = EMOTIONS.filter((e) => selected.includes(e));
  const extra = other.trim();
  const text = [...chips, ...(extra ? [extra] : [])].join(', ');
  return text ? text.slice(0, EMOTION_MAX_LENGTH) : null;
}
