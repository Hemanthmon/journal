import { Router } from 'express';
import {
  createHabitLogSchema,
  habitLogId,
  habitLogQuerySchema,
  updateHabitLogSchema,
  type CreateHabitLogInput,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { notFound } from '../../lib/errors';
import { requireIdParam } from '../../lib/rows';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody, validateQuery } from '../../middleware/validate';
import { dateFilter, editTime, loadForUpdate, saveRecord, softDelete, withoutSeq } from '../../records/crud';
import { findRecord, listRecords } from '../../records/records';

export function habitLogsRouter(): Router {
  const router = Router();

  router.get('/', validateQuery(habitLogQuerySchema), async (req, res) => {
    const q = res.locals.query as { from?: string; to?: string; habitId?: string };
    const { where, params } = dateFilter('t.local_date', q.from, q.to);
    if (q.habitId) {
      where.push('t.habit_id = ?');
      params.push(q.habitId);
    }
    const logs = await listRecords(getPool(), 'habitLogs', requireUserId(req), {
      where: where.join(' AND ') || undefined,
      params,
      orderBy: 't.local_date, t.habit_id',
    });
    res.json({ data: logs });
  });

  router.get('/:id', requireIdParam, async (req, res) => {
    const log = await findRecord(getPool(), 'habitLogs', requireUserId(req), req.params.id as string);
    if (!log) throw notFound();
    res.json({ data: log });
  });

  /**
   * Records progress for a habit on a date (partial progress is fine). There is one log per
   * habit per day: posting again updates the value. A new log snapshots the habit's
   * current target, unit and type; an existing log keeps its snapshot.
   */
  router.post('/', validateBody(createHabitLogSchema), async (req, res) => {
    const userId = requireUserId(req);
    const input = req.body as CreateHabitLogInput;
    const result = await withTransaction(async (conn) => {
      const habit = await findRecord(conn, 'habits', userId, input.habitId);
      if (!habit) throw notFound('Habit not found');
      const id = habitLogId(userId, input.habitId, input.localDate);
      const existing = await findRecord(conn, 'habitLogs', userId, id, { includeDeleted: true, forUpdate: true });
      const now = editTime(existing);
      const log = await saveRecord(conn, userId, 'habitLogs', {
        ...(existing
          ? withoutSeq(existing)
          : {
              id,
              createdAt: now,
              habitId: input.habitId,
              localDate: input.localDate,
              targetSnapshot: habit.targetValue,
              unitSnapshot: habit.unit,
              typeSnapshot: habit.measurementType,
            }),
        value: input.value,
        updatedAt: now,
        deletedAt: null,
      });
      return { log, created: !existing };
    });
    res.status(result.created ? 201 : 200).json({ data: result.log });
  });

  router.patch('/:id', requireIdParam, validateBody(updateHabitLogSchema), async (req, res) => {
    const userId = requireUserId(req);
    const log = await withTransaction(async (conn) => {
      const current = await loadForUpdate(conn, 'habitLogs', userId, req.params.id as string);
      return saveRecord(conn, userId, 'habitLogs', {
        ...withoutSeq(current),
        value: req.body.value,
        updatedAt: editTime(current),
      });
    });
    res.json({ data: log });
  });

  router.delete('/:id', requireIdParam, async (req, res) => {
    const userId = requireUserId(req);
    await withTransaction((conn) => softDelete(conn, 'habitLogs', userId, req.params.id as string));
    res.status(204).end();
  });

  return router;
}
