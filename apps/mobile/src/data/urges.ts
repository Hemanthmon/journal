import { addDays, dateRange, type UrgeRecord } from '@journal/shared';
import { editTime, getLocal, listLocal, writeLocal, type Ctx } from './records';

export interface UrgeDraft {
  localDate: string;
  localTime: string;
  intensity: number;
  triggerText?: string | null;
  actionTaken?: string | null;
  outcome?: string | null;
  emotionBefore?: string | null;
  masturbated?: boolean | null;
  explicitContent?: boolean | null;
  remarks?: string | null;
}

export function listUrges(ctx: Ctx, range: { from?: string; to?: string } = {}): Promise<UrgeRecord[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (range.from) {
    where.push('local_date >= ?');
    params.push(range.from);
  }
  if (range.to) {
    where.push('local_date <= ?');
    params.push(range.to);
  }
  return listLocal(ctx.db, 'urges', {
    where: where.join(' AND ') || undefined,
    params,
    orderBy: 'local_date DESC, local_time DESC',
  });
}

export async function getUrge(ctx: Ctx, id: string): Promise<UrgeRecord | undefined> {
  const row = await getLocal(ctx.db, 'urges', id);
  return row && !row.record.deletedAt ? row.record : undefined;
}

/** Records an urge. The UTC timestamp is generated automatically. */
export function createUrge(ctx: Ctx, draft: UrgeDraft): Promise<UrgeRecord> {
  const now = ctx.now().toISOString();
  return writeLocal(ctx, 'urges', {
    triggerText: null,
    actionTaken: null,
    outcome: null,
    emotionBefore: null,
    masturbated: null,
    explicitContent: null,
    remarks: null,
    ...draft,
    id: ctx.uuid(),
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}

export async function updateUrge(ctx: Ctx, id: string, patch: Partial<UrgeDraft>): Promise<UrgeRecord> {
  const current = await getUrge(ctx, id);
  if (!current) throw new Error('Record not found');
  return writeLocal(ctx, 'urges', { ...current, ...patch, updatedAt: editTime(ctx, current) });
}

export async function deleteUrge(ctx: Ctx, id: string): Promise<void> {
  const current = await getUrge(ctx, id);
  if (!current) return;
  const t = editTime(ctx, current);
  await writeLocal(ctx, 'urges', { ...current, deletedAt: t, updatedAt: t });
}

export interface UrgeTrends {
  days: { localDate: string; count: number; avgIntensity: number | null }[];
  total: number;
  avgIntensity: number | null;
  topTriggers: { label: string; count: number }[];
  topEmotions: { label: string; count: number }[];
}

function topLabels(values: (string | null)[], n = 3) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const v of values) {
    const label = v?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const c = counts.get(key) ?? { label, count: 0 };
    c.count++;
    counts.set(key, c);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, n);
}

/** Simple, neutral trends for the last `days` days ending on `today`. */
export async function urgeTrends(ctx: Ctx, today: string, days = 7): Promise<UrgeTrends> {
  const from = addDays(today, -(days - 1));
  const urges = await listUrges(ctx, { from, to: today });
  const byDay = new Map<string, UrgeRecord[]>();
  for (const u of urges) byDay.set(u.localDate, [...(byDay.get(u.localDate) ?? []), u]);
  const avg = (xs: UrgeRecord[]) => (xs.length ? xs.reduce((s, u) => s + u.intensity, 0) / xs.length : null);
  return {
    days: dateRange(from, today).map((d) => {
      const list = byDay.get(d) ?? [];
      return { localDate: d, count: list.length, avgIntensity: avg(list) };
    }),
    total: urges.length,
    avgIntensity: avg(urges),
    topTriggers: topLabels(urges.map((u) => u.triggerText)),
    topEmotions: topLabels(urges.map((u) => u.emotionBefore)),
  };
}
