import { formatTime12, habitProgress, weekdayName, weekdayOf } from '@journal/shared';
import { listLocal, type Ctx } from './records';

/**
 * Builds CSV exports from the local database, so export works offline and the data
 * never makes an extra trip to the server. Excel opens these files directly.
 */

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel detects UTF-8 (emoji, accents).
  return '﻿' + [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

const yesNo = (v: boolean | null) => (v === null ? '' : v ? 'Yes' : 'No');

export async function exportHabitsCsv(ctx: Ctx): Promise<string> {
  const habits = await listLocal(ctx.db, 'habits', { includeDeleted: true, orderBy: 'display_order' });
  const logs = await listLocal(ctx.db, 'habitLogs', { orderBy: 'local_date, habit_id' });
  const nameById = new Map(habits.map((h) => [h.id, h.name]));
  return toCsv(
    ['Date', 'Day', 'Habit', 'Type', 'Value', 'Target', 'Unit', 'Progress %'],
    logs.map((l) => [
      l.localDate,
      weekdayName(weekdayOf(l.localDate)),
      nameById.get(l.habitId) ?? '(deleted habit)',
      l.typeSnapshot,
      l.value,
      l.targetSnapshot,
      l.unitSnapshot ?? '',
      Math.round(habitProgress(l.typeSnapshot, l.value, l.targetSnapshot)),
    ]),
  );
}

export async function exportHabitDefinitionsCsv(ctx: Ctx): Promise<string> {
  const habits = await listLocal(ctx.db, 'habits', { orderBy: 'display_order' });
  return toCsv(
    ['Habit', 'Description', 'Type', 'Target', 'Unit', 'Days', 'Active', 'Archived'],
    habits.map((h) => [
      h.name,
      h.description ?? '',
      h.measurementType,
      h.targetValue,
      h.unit ?? '',
      h.scheduleDays.map((d) => weekdayName(d)).join(' '),
      h.isActive ? 'Yes' : 'No',
      h.archivedAt ? 'Yes' : 'No',
    ]),
  );
}

export async function exportJournalCsv(ctx: Ctx): Promise<string> {
  const rows = await ctx.db.all<{
    local_date: string;
    question_text_snapshot: string;
    question_type_snapshot: string;
    text_value: string | null;
    emoji_value: number | null;
  }>(
    `SELECT r.local_date, a.question_text_snapshot, a.question_type_snapshot, a.text_value, a.emoji_value
       FROM journal_answers a JOIN daily_routines r ON r.id = a.routine_id
      WHERE a.deleted_at IS NULL AND r.deleted_at IS NULL
      ORDER BY r.local_date, a.created_at`,
  );
  return toCsv(
    ['Date', 'Day', 'Question', 'Answer'],
    rows.map((r) => [
      r.local_date,
      weekdayName(weekdayOf(r.local_date)),
      r.question_text_snapshot,
      r.question_type_snapshot === 'emoji' ? (r.emoji_value ?? '') : (r.text_value ?? ''),
    ]),
  );
}

export async function exportUrgesCsv(ctx: Ctx): Promise<string> {
  const urges = await listLocal(ctx.db, 'urges', { orderBy: 'local_date, local_time' });
  return toCsv(
    [
      'Timestamp (UTC)',
      'Date',
      'Day',
      'Time',
      'Trigger',
      'Intensity (0-10)',
      'Duration (min)',
      'What did I do?',
      'What happened after?',
      'Emotion before',
      'Did I masturbate?',
      'Did I watch explicit content?',
      'Remarks',
    ],
    urges.map((u) => [
      u.occurredAt,
      u.localDate,
      weekdayName(weekdayOf(u.localDate), 'long'),
      formatTime12(u.localTime),
      u.triggerText,
      u.intensity,
      u.durationMinutes ?? '',
      u.actionTaken,
      u.outcome,
      u.emotionBefore,
      yesNo(u.masturbated),
      yesNo(u.explicitContent),
      u.remarks,
    ]),
  );
}
