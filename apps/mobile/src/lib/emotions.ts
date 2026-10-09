/**
 * Converting between the urge form's emotion chips and the stored text. Several chips can
 * be chosen; anything else goes in "Other". The choice is stored as plain comma-separated
 * text in `emotionBefore`, so older free-text records and imports stay compatible, and a
 * chip removed from the list later still shows (as "Other") on records that used it.
 *
 * `options` is the user's current chip list (see data/emotions.ts).
 */

export { EMOTION_MAX_LENGTH, formatEmotions, parseEmotions } from '@journal/shared';
