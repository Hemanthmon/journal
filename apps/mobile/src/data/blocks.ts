import type { BlockColor, PlanTaskRecord, TimeBlockRecord } from '@journal/shared';
import { editTime, getLocal, listLocal, writeLocal, type Ctx } from './records';
import { tasksInRange } from './planner';

/** Calendar time blocks ("Deep work 9–11 AM"), synced like everything else. */

export function blocksInRange(ctx: Ctx, from: string, to: string): Promise<TimeBlockRecord[]> {
  return listLocal(ctx.db, 'timeBlocks', {
    where: 'local_date BETWEEN ? AND ?',
    params: [from, to],
    orderBy: 'local_date, start_time, end_time',
  });
}

export async function getBlock(ctx: Ctx, id: string): Promise<TimeBlockRecord | undefined> {
  const row = await getLocal(ctx.db, 'timeBlocks', id);
  return row && !row.record.deletedAt ? row.record : undefined;
}

export interface BlockDraft {
  title: string;
  localDate: string;
  startTime: string;
  endTime: string;
  color: BlockColor;
  identityId?: string | null;
  notes?: string | null;
}

export function createBlock(ctx: Ctx, d: BlockDraft): Promise<TimeBlockRecord> {
  const now = ctx.now().toISOString();
  return writeLocal(ctx, 'timeBlocks', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...d,
    identityId: d.identityId ?? null,
    notes: d.notes ?? null,
  });
}

export async function updateBlock(ctx: Ctx, id: string, patch: Partial<BlockDraft>): Promise<TimeBlockRecord> {
  const cur = await getBlock(ctx, id);
  if (!cur) throw new Error('This block no longer exists');
  return writeLocal(ctx, 'timeBlocks', { ...cur, ...patch, updatedAt: editTime(ctx, cur) });
}

export async function deleteBlock(ctx: Ctx, id: string): Promise<void> {
  const cur = await getBlock(ctx, id);
  if (!cur) return;
  const t = editTime(ctx, cur);
  await writeLocal(ctx, 'timeBlocks', { ...cur, deletedAt: t, updatedAt: t });
}

/** Minutes since midnight for "HH:MM[:SS]". */
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** How long a timed task occupies on the timeline. */
export const TASK_BLOCK_MINUTES = 30;

export type TimelineItem =
  | { kind: 'block'; id: string; start: number; end: number; block: TimeBlockRecord }
  | { kind: 'task'; id: string; start: number; end: number; task: PlanTaskRecord };

export interface PlacedItem {
  item: TimelineItem;
  /** Side-by-side column for overlapping items, and how many columns its group has. */
  column: number;
  columns: number;
}

/** Blocks plus timed planner tasks for one day, laid out so overlaps sit side by side. */
export async function timelineFor(ctx: Ctx, localDate: string): Promise<PlacedItem[]> {
  const [blocks, tasks] = await Promise.all([blocksInRange(ctx, localDate, localDate), tasksInRange(ctx, localDate, localDate)]);
  const items: TimelineItem[] = [
    ...blocks.map((b) => ({ kind: 'block' as const, id: b.id, start: minutesOf(b.startTime), end: minutesOf(b.endTime), block: b })),
    ...tasks
      .filter((t) => t.localTime)
      .map((t) => {
        const start = minutesOf(t.localTime!);
        return { kind: 'task' as const, id: t.id, start, end: Math.min(start + TASK_BLOCK_MINUTES, 24 * 60), task: t };
      }),
  ];
  return layout(items);
}

/** Greedy column layout: overlapping items share the width, like Google Calendar. */
export function layout(items: TimelineItem[]): PlacedItem[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: PlacedItem[] = [];
  let group: PlacedItem[] = [];
  let groupEnd = -1;
  const flush = () => {
    const columns = Math.max(1, ...group.map((g) => g.column + 1));
    for (const g of group) out.push({ ...g, columns });
    group = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.item.end > item.start).map((g) => g.column));
    let column = 0;
    while (used.has(column)) column++;
    group.push({ item, column, columns: 1 });
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) flush();
  return out;
}
