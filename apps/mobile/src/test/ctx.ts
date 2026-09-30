import { randomUUID } from 'node:crypto';
import type { Db } from '../db/types';
import type { Ctx } from '../data/records';

/** A repository context with a controllable clock. */
export function makeCtx(db: Db, userId: string = randomUUID(), start = new Date('2026-09-29T08:00:00Z')) {
  let t = start.getTime();
  const ctx: Ctx & { advance(ms: number): void; writes: number } = {
    db,
    userId,
    now: () => new Date(t),
    uuid: () => randomUUID(),
    writes: 0,
    onWrite: () => {
      ctx.writes++;
    },
    advance(ms: number) {
      t += ms;
    },
  };
  return ctx;
}

export async function outboxCount(db: Db): Promise<number> {
  return (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n ?? 0;
}
