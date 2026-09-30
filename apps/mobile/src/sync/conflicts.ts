import type { EntityName, JournalAnswerRecord } from '@journal/shared';
import type { Db } from '../db/types';
import { applyServerRecord, editTime, getLocal, writeLocal, type Ctx } from '../data/records';

export interface ConflictItem {
  id: number;
  entity: EntityName;
  recordId: string;
  localDate: string | null;
  question: string;
  mine: string;
  theirs: string;
  serverRecord: JournalAnswerRecord & { serverSeq: number };
}

export async function listConflicts(db: Db): Promise<ConflictItem[]> {
  const rows = await db.all<{ id: number; entity: string; record_id: string; server_json: string }>(
    'SELECT id, entity, record_id, server_json FROM conflicts ORDER BY detected_at',
  );
  const out: ConflictItem[] = [];
  for (const r of rows) {
    if (r.entity !== 'journalAnswers') continue;
    const local = await getLocal(db, 'journalAnswers', r.record_id);
    const server = JSON.parse(r.server_json) as ConflictItem['serverRecord'];
    const routine = local ? await getLocal(db, 'dailyRoutines', local.record.routineId) : undefined;
    out.push({
      id: r.id,
      entity: 'journalAnswers',
      recordId: r.record_id,
      localDate: routine?.record.localDate ?? null,
      question: local?.record.questionTextSnapshot ?? server.questionTextSnapshot,
      mine: local?.record.textValue ?? '',
      theirs: server.textValue ?? '',
      serverRecord: server,
    });
  }
  return out;
}

export type Resolution = 'mine' | 'theirs' | 'both';

/**
 * Resolves a journal conflict. "Keep mine" and "Keep both" re-save locally on top of the
 * server's version (so the next push is accepted); "Keep other" adopts the server copy.
 */
export async function resolveConflict(ctx: Ctx, item: ConflictItem, choice: Resolution): Promise<void> {
  const { db } = ctx;
  const local = await getLocal(db, 'journalAnswers', item.recordId);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM conflicts WHERE id = ?', [item.id]);
    if (choice === 'theirs' || !local) {
      await applyServerRecord(tx, ctx.userId, 'journalAnswers', item.serverRecord, ctx.now());
      return;
    }
    const text =
      choice === 'both' ? `${item.mine.trimEnd()}\n\n— — —\n\n${item.theirs.trimStart()}` : item.mine;
    const updatedAt = editTime(ctx, {
      updatedAt:
        Date.parse(local.record.updatedAt) > Date.parse(item.serverRecord.updatedAt)
          ? local.record.updatedAt
          : item.serverRecord.updatedAt,
    });
    await writeLocal(
      ctx,
      'journalAnswers',
      { ...local.record, textValue: text, updatedAt },
      { tx, baseSeq: item.serverRecord.serverSeq },
    );
  });
  ctx.onWrite?.();
}
