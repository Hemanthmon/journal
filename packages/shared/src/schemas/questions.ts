import { z } from 'zod';
import {
  baseRecordShape,
  displayOrderSchema,
  idSchema,
  isoDateTimeSchema,
  localDateSchema,
  type WithSeq,
} from './common';

export const QUESTION_TYPES = ['text', 'emoji'] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof questionTypeSchema>;

/** Emoji scale used by EMOJI questions. Values are stored as 1..5. */
export const MOOD_OPTIONS = [
  { value: 1, emoji: '😢', label: 'Very sad' },
  { value: 2, emoji: '😟', label: 'Not great' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
] as const;

export function moodOption(value: number | null | undefined) {
  return MOOD_OPTIONS.find((m) => m.value === value);
}

/** Built-in question keys. 'mood' is the one the dashboard shows. */
export const MOOD_SYSTEM_KEY = 'mood';

const textField = z.string().trim().min(1, 'Question text is required').max(500);

export const journalQuestionRecordSchema = z.object({
  ...baseRecordShape,
  text: textField,
  type: questionTypeSchema,
  isRequired: z.boolean(),
  isActive: z.boolean(),
  archivedAt: isoDateTimeSchema.nullable(),
  displayOrder: displayOrderSchema,
  /** Set only by the server for built-in questions; ignored when sent by clients. */
  systemKey: z.string().max(32).nullable(),
});
export type JournalQuestionRecord = z.output<typeof journalQuestionRecordSchema>;
export type JournalQuestion = WithSeq<JournalQuestionRecord>;

export const createQuestionSchema = z
  .object({
    /** Optional client-generated id. Retrying a create with the same id is safe. */
    id: idSchema.optional(),
    text: z.string(),
    type: questionTypeSchema,
    isRequired: z.boolean().optional(),
    isActive: z.boolean().optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .strict();
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/** `systemKey` is deliberately not editable. */
export const updateQuestionSchema = z
  .object({
    text: z.string().optional(),
    type: questionTypeSchema.optional(),
    isRequired: z.boolean().optional(),
    isActive: z.boolean().optional(),
    archived: z.boolean().optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

/** One day's journal. Answers hang off it; habit logs are keyed by date directly. */
export const dailyRoutineRecordSchema = z.object({
  ...baseRecordShape,
  localDate: localDateSchema,
});
export type DailyRoutineRecord = z.output<typeof dailyRoutineRecordSchema>;
export type DailyRoutine = WithSeq<DailyRoutineRecord>;

/** Longest journal answer accepted (~1M characters) — far beyond any real entry, but bounded. */
export const MAX_ANSWER_LENGTH = 1_000_000;

export const journalAnswerRecordSchema = z
  .object({
    ...baseRecordShape,
    routineId: idSchema,
    questionId: idSchema,
    questionTextSnapshot: z.string().min(1).max(500),
    questionTypeSnapshot: questionTypeSchema,
    textValue: z.string().max(MAX_ANSWER_LENGTH).nullable(),
    emojiValue: z.number().int().min(1).max(5).nullable(),
  })
  .superRefine((a, ctx) => {
    if (a.questionTypeSnapshot === 'text' && a.emojiValue !== null) {
      ctx.addIssue({ code: 'custom', path: ['emojiValue'], message: 'Text answers have no emoji value' });
    }
    if (a.questionTypeSnapshot === 'emoji' && a.textValue !== null) {
      ctx.addIssue({ code: 'custom', path: ['textValue'], message: 'Emoji answers have no text value' });
    }
  });
export type JournalAnswerRecord = z.output<typeof journalAnswerRecordSchema>;
export type JournalAnswer = WithSeq<JournalAnswerRecord>;

const answerValueShape = {
  textValue: z.string().max(MAX_ANSWER_LENGTH).nullable().optional(),
  emojiValue: z.number().int().min(1).max(5).nullable().optional(),
};

export const createAnswerSchema = z
  .object({
    localDate: localDateSchema,
    questionId: idSchema,
    ...answerValueShape,
  })
  .strict();
export type CreateAnswerInput = z.infer<typeof createAnswerSchema>;

export const updateAnswerSchema = z
  .object(answerValueShape)
  .strict()
  .refine((v) => v.textValue !== undefined || v.emojiValue !== undefined, 'Provide textValue or emojiValue');
export type UpdateAnswerInput = z.infer<typeof updateAnswerSchema>;

export const putDailyRoutineSchema = z
  .object({
    answers: z
      .array(z.object({ questionId: idSchema, ...answerValueShape }).strict())
      .max(100)
      .default([]),
  })
  .strict();
export type PutDailyRoutineInput = z.infer<typeof putDailyRoutineSchema>;

export interface DailyRoutineDetail {
  localDate: string;
  routine: DailyRoutine | null;
  answers: JournalAnswer[];
  habitLogs: import('./habits').HabitLog[];
}
