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
