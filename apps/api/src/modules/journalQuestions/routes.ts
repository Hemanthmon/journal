import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  createQuestionSchema,
  reorderSchema,
  updateQuestionSchema,
  type CreateQuestionInput,
  type UpdateQuestionInput,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { notFound } from '../../lib/errors';
import { requireIdParam } from '../../lib/rows';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { editTime, loadForUpdate, reorder, saveRecord, softDelete, withoutSeq } from '../../records/crud';
import { findRecord, listRecords, nextDisplayOrder } from '../../records/records';

const listQuestions = (userId: string) =>
  listRecords(getPool(), 'journalQuestions', userId, { orderBy: 't.display_order, t.created_at' });

export function journalQuestionsRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json({ data: await listQuestions(requireUserId(req)) });
  });

  router.get('/:id', requireIdParam, async (req, res) => {
    const q = await findRecord(getPool(), 'journalQuestions', requireUserId(req), req.params.id as string);
    if (!q) throw notFound();
    res.json({ data: q });
  });

  router.post('/', validateBody(createQuestionSchema), async (req, res) => {
    const userId = requireUserId(req);
    const input = req.body as CreateQuestionInput;
    const result = await withTransaction(async (conn) => {
      if (input.id) {
        const existing = await findRecord(conn, 'journalQuestions', userId, input.id, { includeDeleted: true });
        if (existing) return { question: existing, created: false };
      }
      const now = new Date().toISOString();
      const question = await saveRecord(conn, userId, 'journalQuestions', {
        id: input.id ?? randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        text: input.text,
        type: input.type,
        isRequired: input.isRequired ?? false,
        isActive: input.isActive ?? true,
        archivedAt: null,
        displayOrder: input.displayOrder ?? (await nextDisplayOrder(conn, 'journalQuestions', userId)),
        systemKey: null,
      });
      return { question, created: true };
    });
    res.status(result.created ? 201 : 200).json({ data: result.question });
  });

  router.post('/reorder', validateBody(reorderSchema), async (req, res) => {
    const userId = requireUserId(req);
    await withTransaction((conn) => reorder(conn, 'journalQuestions', userId, req.body.ids));
    res.json({ data: await listQuestions(userId) });
  });

  /** Edit. Existing answers keep the question text/type snapshot they were given. */
  router.patch('/:id', requireIdParam, validateBody(updateQuestionSchema), async (req, res) => {
    const userId = requireUserId(req);
    const patch = req.body as UpdateQuestionInput;
    const question = await withTransaction(async (conn) => {
      const current = await loadForUpdate(conn, 'journalQuestions', userId, req.params.id as string);
      const { archived, ...fields } = patch;
      const merged: Record<string, unknown> = { ...withoutSeq(current), ...fields, updatedAt: editTime(current) };
      if (archived !== undefined) merged.archivedAt = archived ? (current.archivedAt ?? editTime()) : null;
      return saveRecord(conn, userId, 'journalQuestions', merged);
    });
    res.json({ data: question });
  });

  router.delete('/:id', requireIdParam, async (req, res) => {
    const userId = requireUserId(req);
    await withTransaction((conn) => softDelete(conn, 'journalQuestions', userId, req.params.id as string));
    res.status(204).end();
  });

  return router;
}
