import ExcelJS from 'exceljs';
import { MOOD_OPTIONS, dateRange, formatTime12, type ResolvedRange } from '@journal/shared';
import { localDateTimeIn } from '../../lib/tz';
import type { Analyzer } from './analytics';

/**
 * Builds a genuine .xlsx workbook for a date range, with one sheet per area. Values are
 * written as plain cell values (never formulas), so text can't execute in Excel.
 */

const yesNo = (v: boolean | null) => (v === null ? '' : v ? 'Yes' : 'No');
const moodLabel = (v: number | null) => {
  const m = MOOD_OPTIONS.find((o) => o.value === v);
  return m ? `${m.emoji} ${m.label}` : '';
};

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns;
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E6FCB' } };
  header.alignment = { vertical: 'middle' };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

export async function buildWorkbook(a: Analyzer, range: ResolvedRange, ownerName: string): Promise<Buffer> {
  const tz = a.d.timezone;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Journal dashboard';
  wb.created = new Date();
  wb.title = `${ownerName} — ${range.from} to ${range.to}`;

  const habits = sheet(wb, 'Daily Habits', [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Day', key: 'day', width: 11 },
    { header: 'Habit', key: 'habit', width: 28 },
    { header: 'Measurement', key: 'type', width: 13 },
    { header: 'Value', key: 'value', width: 9 },
    { header: 'Target', key: 'target', width: 9 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Progress %', key: 'progress', width: 11 },
    { header: 'Completed', key: 'completed', width: 11 },
  ]);
  for (const date of dateRange(range.from, range.to)) {
    const day = a.dayDetail(date);
    for (const h of day.habits) {
      habits.addRow({
        date,
        day: day.weekday,
        habit: h.name,
        type: h.type,
        value: h.value,
        target: h.target,
        unit: h.unit ?? '',
        progress: Math.round(h.progress),
        completed: h.completed ? 'Yes' : 'No',
      });
    }
  }

  const journal = sheet(wb, 'Journal and Mood', [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Day', key: 'day', width: 11 },
    { header: 'Question', key: 'question', width: 42 },
    { header: 'Answer', key: 'answer', width: 70 },
    { header: 'Mood', key: 'mood', width: 16 },
    { header: 'Last edited', key: 'edited', width: 17 },
  ]);
  for (const date of dateRange(range.from, range.to)) {
    const day = a.dayDetail(date);
    for (const ans of day.answers) {
      const row = journal.addRow({
        date,
        day: day.weekday,
        question: ans.question,
        answer: ans.type === 'emoji' ? '' : (ans.textValue ?? ''),
        mood: ans.type === 'emoji' ? moodLabel(ans.emojiValue) : '',
        edited: localDateTimeIn(new Date(ans.updatedAt), tz),
      });
      row.getCell('answer').alignment = { wrapText: true, vertical: 'top' };
    }
  }

  const urges = sheet(wb, 'Urge Records', [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Day', key: 'day', width: 11 },
    { header: 'Time', key: 'time', width: 10 },
    { header: 'Trigger', key: 'trigger', width: 40 },
    { header: 'Intensity (0-10)', key: 'intensity', width: 15 },
    { header: 'Duration (min)', key: 'duration', width: 14 },
    { header: 'Emotion before', key: 'emotion', width: 28 },
    { header: 'What I did', key: 'action', width: 40 },
    { header: 'What happened after', key: 'outcome', width: 40 },
    { header: 'Masturbated', key: 'masturbated', width: 12 },
    { header: 'Watched content', key: 'explicit', width: 15 },
    { header: 'Diverted', key: 'diverted', width: 10 },
    { header: 'Remarks', key: 'remarks', width: 40 },
  ]);
  const records = a.urgeAnalytics(range).records.slice().reverse();
  for (const u of records) {
    urges.addRow({
      date: u.localDate,
      day: u.weekday,
      time: formatTime12(u.localTime),
      trigger: u.triggerText ?? '',
      intensity: u.intensity,
      duration: u.durationMinutes ?? '',
      emotion: u.emotionBefore ?? '',
      action: u.actionTaken ?? '',
      outcome: u.outcome ?? '',
      masturbated: yesNo(u.masturbated),
      explicit: yesNo(u.explicitContent),
      diverted: yesNo(u.diverted),
      remarks: u.remarks ?? '',
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
