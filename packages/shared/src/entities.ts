import type { z } from 'zod';
import { habitLogRecordSchema, habitRecordSchema, type HabitLogRecord, type HabitRecord } from './schemas/habits';
import {
  dailyRoutineRecordSchema,
  journalAnswerRecordSchema,
  journalQuestionRecordSchema,
  type DailyRoutineRecord,
  type JournalAnswerRecord,
  type JournalQuestionRecord,
} from './schemas/questions';
import { emotionOptionRecordSchema, type EmotionOptionRecord } from './schemas/emotions';
import { reminderRecordSchema, type ReminderRecord } from './schemas/reminders';
import { urgeRecordSchema, type UrgeRecord } from './schemas/urges';

/**
 * Single description of every synced table, used by the server (MySQL) and the app
 * (SQLite) to convert between database rows and wire records. Both databases use the
 * same table and column names.
 *
 * Column types:
 *   string   text
 *   number   integer or decimal
 *   bool     0/1 (nullable -> NULL)
 *   datetime UTC instant: DATETIME(3) in MySQL, ISO string in SQLite
 *   date     'YYYY-MM-DD'
 *   time     'HH:MM:SS'
 *   mask     weekday array <-> bitmask integer
 */
export type ColumnType = 'string' | 'number' | 'bool' | 'datetime' | 'date' | 'time' | 'mask';

export interface FieldDef {
  field: string;
  col: string;
  type: ColumnType;
}

const f = (field: string, col: string, type: ColumnType): FieldDef => ({ field, col, type });

const BASE_FIELDS: FieldDef[] = [
  f('id', 'id', 'string'),
  f('createdAt', 'created_at', 'datetime'),
  f('updatedAt', 'updated_at', 'datetime'),
  f('deletedAt', 'deleted_at', 'datetime'),
];

export interface EntityDef {
  table: string;
  fields: FieldDef[];
  schema: z.ZodType;
  /**
   * User-created records whose deletion is final: once deleted on the server, older or
   * concurrent edits from other devices can't bring them back. Records with deterministic
   * ids (one per day) are not sticky, so a day's log/answer can be recorded again.
   */
  stickyDelete: boolean;
}

export const ENTITIES = {
  habits: {
    table: 'habits',
    fields: [
      ...BASE_FIELDS,
      f('name', 'name', 'string'),
      f('description', 'description', 'string'),
      f('measurementType', 'measurement_type', 'string'),
      f('targetValue', 'target_value', 'number'),
      f('unit', 'unit', 'string'),
      f('scheduleDays', 'schedule_days', 'mask'),
      f('isActive', 'is_active', 'bool'),
      f('archivedAt', 'archived_at', 'datetime'),
      f('displayOrder', 'display_order', 'number'),
    ],
    schema: habitRecordSchema,
    stickyDelete: true,
  },
  journalQuestions: {
    table: 'journal_questions',
    fields: [
      ...BASE_FIELDS,
      f('text', 'text', 'string'),
      f('type', 'type', 'string'),
      f('isRequired', 'is_required', 'bool'),
      f('isActive', 'is_active', 'bool'),
      f('archivedAt', 'archived_at', 'datetime'),
      f('displayOrder', 'display_order', 'number'),
      f('systemKey', 'system_key', 'string'),
    ],
    schema: journalQuestionRecordSchema,
    stickyDelete: true,
  },
  dailyRoutines: {
    table: 'daily_routines',
    fields: [...BASE_FIELDS, f('localDate', 'local_date', 'date')],
    schema: dailyRoutineRecordSchema,
    stickyDelete: false,
  },
  habitLogs: {
    table: 'habit_logs',
    fields: [
      ...BASE_FIELDS,
      f('habitId', 'habit_id', 'string'),
      f('localDate', 'local_date', 'date'),
      f('value', 'value', 'number'),
      f('targetSnapshot', 'target_snapshot', 'number'),
      f('unitSnapshot', 'unit_snapshot', 'string'),
      f('typeSnapshot', 'type_snapshot', 'string'),
    ],
    schema: habitLogRecordSchema,
    stickyDelete: false,
  },
  journalAnswers: {
    table: 'journal_answers',
    fields: [
      ...BASE_FIELDS,
      f('routineId', 'routine_id', 'string'),
      f('questionId', 'question_id', 'string'),
      f('questionTextSnapshot', 'question_text_snapshot', 'string'),
      f('questionTypeSnapshot', 'question_type_snapshot', 'string'),
      f('textValue', 'text_value', 'string'),
      f('emojiValue', 'emoji_value', 'number'),
    ],
    schema: journalAnswerRecordSchema,
    stickyDelete: false,
  },
  urges: {
    table: 'urge_records',
    fields: [
      ...BASE_FIELDS,
      f('occurredAt', 'occurred_at', 'datetime'),
      f('localDate', 'local_date', 'date'),
      f('localTime', 'local_time', 'time'),
      f('triggerText', 'trigger_text', 'string'),
      f('intensity', 'intensity', 'number'),
      f('actionTaken', 'action_taken', 'string'),
      f('outcome', 'outcome', 'string'),
      f('emotionBefore', 'emotion_before', 'string'),
      f('masturbated', 'masturbated', 'bool'),
      f('explicitContent', 'explicit_content', 'bool'),
      f('remarks', 'remarks', 'string'),
    ],
    schema: urgeRecordSchema,
    stickyDelete: true,
  },
  reminders: {
    table: 'reminders',
    fields: [
      ...BASE_FIELDS,
      f('text', 'text', 'string'),
      f('isActive', 'is_active', 'bool'),
      f('displayOrder', 'display_order', 'number'),
    ],
    schema: reminderRecordSchema,
    stickyDelete: true,
  },
  emotionOptions: {
    table: 'emotion_options',
    fields: [...BASE_FIELDS, f('name', 'name', 'string'), f('displayOrder', 'display_order', 'number')],
    schema: emotionOptionRecordSchema,
    // A default emotion the user removed must not come back from another device.
    stickyDelete: true,
  },
} satisfies Record<string, EntityDef>;

export type EntityName = keyof typeof ENTITIES;

/** Parents before children: push and apply in this order so references resolve. */
export const ENTITY_ORDER: EntityName[] = [
  'habits',
  'journalQuestions',
  'dailyRoutines',
  'habitLogs',
  'journalAnswers',
  'urges',
  'reminders',
  'emotionOptions',
];

export interface EntityRecordMap {
  habits: HabitRecord;
  journalQuestions: JournalQuestionRecord;
  dailyRoutines: DailyRoutineRecord;
  habitLogs: HabitLogRecord;
  journalAnswers: JournalAnswerRecord;
  urges: UrgeRecord;
  reminders: ReminderRecord;
  emotionOptions: EmotionOptionRecord;
}

export type AnyRecord = EntityRecordMap[EntityName];

export function isEntityName(v: unknown): v is EntityName {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ENTITIES, v);
}

/**
 * Fields compared to decide whether an incoming record actually changes anything.
 * Timestamps are excluded; deletion is included.
 */
export function contentFields(entity: EntityName): string[] {
  return ENTITIES[entity].fields
    .map((fd) => fd.field)
    .filter((name) => name !== 'id' && name !== 'createdAt' && name !== 'updatedAt');
}
