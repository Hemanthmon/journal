import { Router } from 'express';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  ENTITIES,
  ENTITY_ORDER,
  ErrorCode,
  isEntityName,
  pullQuerySchema,
  pushRequestSchema,
  type PullChange,
  type PullResponse,
  type PushChange,
  type PushRequest,
  type PushResponse,
  type PushResult,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { AppError, unauthenticated } from '../../lib/errors';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody, validateQuery } from '../../middleware/validate';
import { applyRecord, constraintErrorCode, findRecord, rowToRecord, type ApplyOutcome } from '../../records/records';

const PROCESSED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type Row = RowDataPacket & Record<string, unknown>;

function toResult(changeId: string, outcome: ApplyOutcome): PushResult {
  switch (outcome.status) {
    case 'applied':
      return { changeId, status: 'applied', serverSeq: outcome.serverSeq };
    case 'stale':
    case 'conflict':
      return {
        changeId,
        status: outcome.status,
        serverSeq: outcome.serverRecord.serverSeq,
        record: outcome.serverRecord as PushResult['record'],
      };
    case 'rejected':
      return { changeId, status: 'rejected', errorCode: outcome.errorCode, details: outcome.details };
  }
}

/** Re-answers a change that was already processed (a client retry) without applying it again. */
async function replay(conn: PoolConnection, userId: string, ch: PushChange, stored: PushResult): Promise<PushResult> {
  if ((stored.status === 'stale' || stored.status === 'conflict') && isEntityName(ch.entity)) {
    const current = await findRecord(conn, ch.entity, userId, String(ch.record.id), { includeDeleted: true });
    if (current) return { ...stored, serverSeq: current.serverSeq, record: current as PushResult['record'] };
  }
  return stored;
}

async function processChange(conn: PoolConnection, userId: string, ch: PushChange, now: Date): Promise<PushResult> {
  if (!isEntityName(ch.entity)) return { changeId: ch.changeId, status: 'rejected', errorCode: 'UNKNOWN_ENTITY' };
  // Each change gets a savepoint, so one bad change doesn't undo the others in the batch.
  await conn.query('SAVEPOINT sync_change');
  try {
    const outcome = await applyRecord(conn, userId, ch.entity, ch.record, { now, baseSeq: ch.baseSeq });
    await conn.query('RELEASE SAVEPOINT sync_change');
    return toResult(ch.changeId, outcome);
  } catch (err) {
    const code = constraintErrorCode(err);
    if (!code) throw err;
    await conn.query('ROLLBACK TO SAVEPOINT sync_change');
    return { changeId: ch.changeId, status: 'rejected', errorCode: code };
  }
}

export function syncRouter(): Router {
  const router = Router();

  /**
   * Upload local changes. Idempotent: each change carries a `changeId`; a retried change
   * returns its original result instead of being applied twice. Changes are applied in
   * order, so parents (habits, routines) should precede children (logs, answers).
   */
  router.post('/push', validateBody(pushRequestSchema), async (req, res) => {
    const userId = requireUserId(req);
    const { epoch, changes } = req.body as PushRequest;
    const now = new Date();

    const outcome = await withTransaction(async (conn) => {
      const [users] = await conn.execute<Row[]>('SELECT data_epoch FROM users WHERE id = ? FOR UPDATE', [userId]);
      const user = users[0];
      if (!user) throw unauthenticated();
      const serverEpoch = Number(user.data_epoch);
      if (serverEpoch !== epoch) return { epochMismatch: true as const };

      const results: PushResult[] = [];
      for (const ch of changes) {
        const [done] = await conn.execute<Row[]>(
          'SELECT result FROM processed_changes WHERE user_id = ? AND change_id = ?',
          [userId, ch.changeId],
        );
        if (done[0]) {
          results.push(await replay(conn, userId, ch, done[0].result as PushResult));
          continue;
        }
        const result = await processChange(conn, userId, ch, now);
        // Store only the outcome, never the record contents.
        const { record: _record, details: _details, ...stored } = result;
        await conn.execute('INSERT INTO processed_changes (user_id, change_id, result, created_at) VALUES (?, ?, ?, ?)', [
          userId,
          ch.changeId,
          JSON.stringify(stored),
          now,
        ]);
        results.push(result);
      }
      await conn.execute('DELETE FROM processed_changes WHERE user_id = ? AND created_at < ?', [
        userId,
        new Date(now.getTime() - PROCESSED_RETENTION_MS),
      ]);
      return { epochMismatch: false as const, body: { epoch: serverEpoch, results } satisfies PushResponse };
    });

    if (outcome.epochMismatch) {
      throw new AppError(409, ErrorCode.EPOCH_CHANGED, 'Your data was reset on another device. Re-download required.');
    }
    res.json({ data: outcome.body });
  });

  /**
   * Download changes since `cursor` (a server sequence number), oldest first, including
   * deletions. Reads run in one consistent snapshot so no change is skipped.
   */
  router.get('/pull', validateQuery(pullQuerySchema), async (req, res) => {
    const userId = requireUserId(req);
    const { cursor, limit } = res.locals.query as { cursor: number; limit: number };
    const conn = await getPool().getConnection();
    try {
      await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const [users] = await conn.execute<Row[]>('SELECT data_epoch FROM users WHERE id = ?', [userId]);
      if (!users[0]) throw unauthenticated();

      const all: PullChange[] = [];
      for (const entity of ENTITY_ORDER) {
        const def = ENTITIES[entity];
        const [rows] = await conn.query<Row[]>(
          `SELECT server_seq, ${def.fields.map((f) => f.col).join(', ')} FROM ${def.table}
            WHERE user_id = ? AND server_seq > ? ORDER BY server_seq LIMIT ?`,
          [userId, cursor, limit + 1],
        );
        for (const r of rows) all.push({ entity, record: rowToRecord(entity, r) as PullChange['record'] });
      }
      await conn.query('COMMIT');

      all.sort((a, b) => a.record.serverSeq - b.record.serverSeq);
      const changes = all.slice(0, limit);
      const body: PullResponse = {
        epoch: Number(users[0].data_epoch),
        changes,
        nextCursor: changes.at(-1)?.record.serverSeq ?? cursor,
        hasMore: all.length > limit,
      };
      res.json({ data: body });
    } catch (err) {
      await conn.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      conn.release();
    }
  });

  return router;
}
