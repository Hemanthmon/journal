import { z } from 'zod';
import { baseRecordShape, displayOrderSchema, type WithSeq } from './common';

/** One selectable emotion in the urge form's "Emotion felt before the urge" chips. */
export const emotionOptionRecordSchema = z.object({
  ...baseRecordShape,
  name: z.string().trim().min(1, 'Enter an emotion').max(40, 'Keep it under 40 characters'),
  displayOrder: displayOrderSchema,
});
export type EmotionOptionRecord = z.output<typeof emotionOptionRecordSchema>;
export type EmotionOption = WithSeq<EmotionOptionRecord>;

/** Starting list for new users (they can add, remove and reorder). */
export const DEFAULT_EMOTIONS = [
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

// ------------------------------------------------------------------ urge form chips

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
