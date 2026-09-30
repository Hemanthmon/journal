import { Router, type NextFunction, type Request, type Response } from 'express';
import { dateRangeQuerySchema, localDateSchema, putDailyRoutineSchema, type PutDailyRoutineInput } from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { AppError } from '../../lib/errors';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody, validateQuery } from '../../middleware/validate';
import { ensureRoutine, listDays, upsertAnswer } from './service';
import { ErrorCode } from '@journal/shared';

function requireDateParam(req: Request, _res: Response, next: NextFunction) {
  if (!localDateSchema.safeParse(req.params.date).success) {
    next(new AppError(400, ErrorCode.VALIDATION_ERROR, 'Date must be YYYY-MM-DD'));
    return;
  }
  next();
}

async function getDay(userId: string, localDate: string) {
  const [day] = await listDays(getPool(), userId, { from: localDate, to: localDate });
  return day ?? { localDate, routine: null, answers: [], habitLogs: [] };
}

export function dailyRoutinesRouter(): Router {
  const router = Router();

  /** Days in a range, each with its routine, journal answers and habit logs. */
  router.get('/', validateQuery(dateRangeQuerySchema), async (req, res) => {
    res.json({ data: await listDays(getPool(), requireUserId(req), res.locals.query) });
  });

  router.get('/:date', requireDateParam, async (req, res) => {
    res.json({ data: await getDay(requireUserId(req), req.params.date as string) });
  });

  /**
   * Saves a day's journal. Only the answers sent are written; others are left alone, so a
   * partially completed day can be saved. Runs in one transaction.
   */
  router.put('/:date', requireDateParam, validateBody(putDailyRoutineSchema), async (req, res) => {
    const userId = requireUserId(req);
    const localDate = req.params.date as string;
    const { answers } = req.body as PutDailyRoutineInput;
    await withTransaction(async (conn) => {
      await ensureRoutine(conn, userId, localDate);
      for (const a of answers) await upsertAnswer(conn, userId, localDate, a.questionId, a);
    });
    res.json({ data: await getDay(userId, localDate) });
  });

  return router;
}
