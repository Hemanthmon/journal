import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { createUrgeSchema, updateUrgeSchema, urgeQuerySchema, type CreateUrgeInput } from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { notFound } from '../../lib/errors';
import { requireIdParam } from '../../lib/rows';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody, validateQuery } from '../../middleware/validate';
import { dateFilter, editTime, loadForUpdate, saveRecord, softDelete, withoutSeq } from '../../records/crud';
import { findRecord, listRecords } from '../../records/records';

export function urgesRouter(): Router {
  const router = Router();

  /** Newest first, optionally filtered by local date range. */
  router.get('/', validateQuery(urgeQuerySchema), async (req, res) => {
    const q = res.locals.query as { from?: string; to?: string; limit: number };
    const { where, params } = dateFilter('t.local_date', q.from, q.to);
    const urges = await listRecords(getPool(), 'urges', requireUserId(req), {
      where: where.join(' AND ') || undefined,
      params,
      orderBy: 't.local_date DESC, t.local_time DESC',
      limit: q.limit,
    });
    res.json({ data: urges });
  });

  router.get('/:id', requireIdParam, async (req, res) => {
    const urge = await findRecord(getPool(), 'urges', requireUserId(req), req.params.id as string);
    if (!urge) throw notFound();
    res.json({ data: urge });
  });

  /** Record an urge. Retrying with the same client `id` returns the existing record. */
  router.post('/', validateBody(createUrgeSchema), async (req, res) => {
    const userId = requireUserId(req);
    const input = req.body as CreateUrgeInput;
    const result = await withTransaction(async (conn) => {
      if (input.id) {
        const existing = await findRecord(conn, 'urges', userId, input.id, { includeDeleted: true });
        if (existing) return { urge: existing, created: false };
      }
      const now = new Date().toISOString();
      const urge = await saveRecord(conn, userId, 'urges', {
        durationMinutes: null,
        triggerText: null,
        actionTaken: null,
        outcome: null,
        emotionBefore: null,
        masturbated: null,
        explicitContent: null,
        remarks: null,
        ...input,
        id: input.id ?? randomUUID(),
        occurredAt: input.occurredAt ?? now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      return { urge, created: true };
    });
    res.status(result.created ? 201 : 200).json({ data: result.urge });
  });

  router.patch('/:id', requireIdParam, validateBody(updateUrgeSchema), async (req, res) => {
    const userId = requireUserId(req);
    const urge = await withTransaction(async (conn) => {
      const current = await loadForUpdate(conn, 'urges', userId, req.params.id as string);
      return saveRecord(conn, userId, 'urges', { ...withoutSeq(current), ...req.body, updatedAt: editTime(current) });
    });
    res.json({ data: urge });
  });

  router.delete('/:id', requireIdParam, async (req, res) => {
    const userId = requireUserId(req);
    await withTransaction((conn) => softDelete(conn, 'urges', userId, req.params.id as string));
    res.status(204).end();
  });

  return router;
}
