import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  ALL_WEEKDAYS,
  createHabitSchema,
  reorderSchema,
  updateHabitSchema,
  type CreateHabitInput,
  type Habit,
  type UpdateHabitInput,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { notFound } from '../../lib/errors';
import { requireIdParam } from '../../lib/rows';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { editTime, loadForUpdate, reorder, saveRecord, softDelete, withoutSeq } from '../../records/crud';
import { findRecord, listRecords, nextDisplayOrder } from '../../records/records';

const listHabits = (userId: string) =>
  listRecords(getPool(), 'habits', userId, { orderBy: 't.display_order, t.created_at' });

export function habitsRouter(): Router {
  const router = Router();

  /** All non-deleted habits (active, disabled and archived), in display order. */
  router.get('/', async (req, res) => {
    res.json({ data: await listHabits(requireUserId(req)) });
  });

  router.get('/:id', requireIdParam, async (req, res) => {
    const habit = await findRecord(getPool(), 'habits', requireUserId(req), req.params.id as string);
    if (!habit) throw notFound();
    res.json({ data: habit });
  });

  /** Create. Sending the same client `id` again returns the existing habit (200) instead of a duplicate. */
  router.post('/', validateBody(createHabitSchema), async (req, res) => {
    const userId = requireUserId(req);
    const input = req.body as CreateHabitInput;
    const result = await withTransaction(async (conn) => {
      if (input.id) {
        const existing = await findRecord(conn, 'habits', userId, input.id, { includeDeleted: true });
        if (existing) return { habit: existing, created: false };
      }
      const now = new Date().toISOString();
      const habit = await saveRecord(conn, userId, 'habits', {
        id: input.id ?? randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        name: input.name,
        description: input.description ?? null,
        measurementType: input.measurementType,
        targetValue: input.targetValue ?? (input.measurementType === 'boolean' ? 1 : undefined),
        unit: input.unit ?? null,
        scheduleDays: input.scheduleDays ?? ALL_WEEKDAYS,
        isActive: input.isActive ?? true,
        archivedAt: null,
        displayOrder: input.displayOrder ?? (await nextDisplayOrder(conn, 'habits', userId)),
      });
      return { habit, created: true };
    });
    res.status(result.created ? 201 : 200).json({ data: result.habit });
  });

  /** Reorder: `{ ids }` in the new order. */
  router.post('/reorder', validateBody(reorderSchema), async (req, res) => {
    const userId = requireUserId(req);
    await withTransaction((conn) => reorder(conn, 'habits', userId, req.body.ids));
    res.json({ data: await listHabits(userId) });
  });

  /**
   * Edit. Changing the target, unit, type or schedule never touches existing habit logs:
   * each log keeps the snapshot taken when it was recorded.
   */
  router.patch('/:id', requireIdParam, validateBody(updateHabitSchema), async (req, res) => {
    const userId = requireUserId(req);
    const patch = req.body as UpdateHabitInput;
    const habit = await withTransaction(async (conn) => {
      const current = await loadForUpdate(conn, 'habits', userId, req.params.id as string);
      const { archived, ...fields } = patch;
      const merged: Record<string, unknown> = { ...withoutSeq(current), ...fields, updatedAt: editTime(current) };
      if (patch.measurementType === 'boolean' && patch.targetValue === undefined) merged.targetValue = 1;
      if (archived !== undefined) merged.archivedAt = archived ? (current.archivedAt ?? editTime()) : null;
      return saveRecord(conn, userId, 'habits', merged);
    });
    res.json({ data: habit satisfies Habit });
  });

  /** Soft delete: the habit disappears from lists, but its history is kept. */
  router.delete('/:id', requireIdParam, async (req, res) => {
    const userId = requireUserId(req);
    await withTransaction((conn) => softDelete(conn, 'habits', userId, req.params.id as string));
    res.status(204).end();
  });

  return router;
}
