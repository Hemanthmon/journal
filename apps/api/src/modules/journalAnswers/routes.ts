import { Router } from 'express';
import {
  createAnswerSchema,
  dateRangeQuerySchema,
  updateAnswerSchema,
  type CreateAnswerInput,
  type UpdateAnswerInput,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { notFound } from '../../lib/errors';
import { requireIdParam } from '../../lib/rows';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody, validateQuery } from '../../middleware/validate';
import { loadForUpdate, softDelete } from '../../records/crud';
import { findRecord } from '../../records/records';
import { listAnswers, updateAnswerValue, upsertAnswer } from '../dailyRoutines/service';

export function journalAnswersRouter(): Router {
  const router = Router();

  router.get('/', validateQuery(dateRangeQuerySchema), async (req, res) => {
    res.json({ data: await listAnswers(getPool(), requireUserId(req), res.locals.query) });
  });

  router.get('/:id', requireIdParam, async (req, res) => {
    const a = await findRecord(getPool(), 'journalAnswers', requireUserId(req), req.params.id as string);
    if (!a) throw notFound();
    res.json({ data: a });
  });

  /** Answer a question for a date. There is one answer per question per day; posting again updates it. */
  router.post('/', validateBody(createAnswerSchema), async (req, res) => {
    const userId = requireUserId(req);
    const input = req.body as CreateAnswerInput;
    const answer = await withTransaction((conn) =>
      upsertAnswer(conn, userId, input.localDate, input.questionId, input),
    );
    res.status(201).json({ data: answer });
  });

  router.patch('/:id', requireIdParam, validateBody(updateAnswerSchema), async (req, res) => {
    const userId = requireUserId(req);
    const answer = await withTransaction(async (conn) => {
      const current = await loadForUpdate(conn, 'journalAnswers', userId, req.params.id as string);
      return updateAnswerValue(conn, current, userId, req.body as UpdateAnswerInput);
    });
    res.json({ data: answer });
  });

  router.delete('/:id', requireIdParam, async (req, res) => {
    const userId = requireUserId(req);
    await withTransaction((conn) => softDelete(conn, 'journalAnswers', userId, req.params.id as string));
    res.status(204).end();
  });

  return router;
}
