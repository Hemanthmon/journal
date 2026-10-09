import { Router, type NextFunction, type Request, type Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import {
  ENTITIES,
  ErrorCode,
  addDays,
  isEntityName,
  localDateSchema,
  monthStartOf,
  type EntityName,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { AppError, notFound } from '../../lib/errors';
import { localDateIn } from '../../lib/tz';
import { validateBody, validateQuery } from '../../middleware/validate';
import { applyRecord, constraintErrorCode, findRecord, rowToRecord } from '../../records/records';
import { notifyBlocksChanged } from '../calendar/blocks';
import { createSeriesFor, deleteOccurrenceFor, editOccurrenceFor, ensureOccurrencesFor } from '../calendar/series';
import type { DashboardContext } from './auth';

/**
 * The owner's website is a full editor: it reads raw records and writes them back through
 * the same `applyRecord` the app's sync uses, so every edit reaches the phone on its next
 * pull and gets the same validation and conflict rules.
 */

type Row = RowDataPacket & Record<string, unknown>;

/** Record types the owner may change from the website. */
const EDITABLE: EntityName[] = [
  'habits',
  'habitLogs',
  'dailyRoutines',
  'journalAnswers',
  'urges',
  'identities',
  'planGoals',
  'planTasks',
  'planReviews',
  'timeBlocks',
];

const repeatSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'custom']),
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    endDate: localDateSchema.nullable(),
  })
  .strict();
const fieldsSchema = z
  .object({
    title: z.string().trim().min(1, 'Give it a name').max(200),
    startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
    endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
    color: z.enum(['sage', 'sky', 'lavender', 'peach', 'rose', 'sand']).nullable(),
    identityId: z.string().uuid().nullable(),
    notes: z.string().max(2000).nullable().optional(),
    place: z.string().max(100).nullable().optional(),
    twoMinute: z.string().max(200).nullable().optional(),
  })
  .strict();
const kindSchema = z.enum(['block', 'task']);
const scopeSchema = z.enum(['one', 'following']);

function ownerCtx(req: Request): DashboardContext {
  const c = req.dashboard;
  if (!c) throw notFound();
  if (!c.isOwner) throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the owner can make changes');
  return c;
}

async function rows(entity: EntityName, userId: string, where = '', params: unknown[] = []) {
  const def = ENTITIES[entity];
  const [r] = await getPool().query<Row[]>(
    `SELECT server_seq, ${def.fields.map((f) => f.col).join(', ')} FROM ${def.table}
      WHERE user_id = ? AND deleted_at IS NULL${where}`,
    [userId, ...params],
  );
  return r.map((x) => rowToRecord(entity, x));
}

const rangeSchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine((v) => v.from <= v.to, { message: '`from` must not be after `to`', path: ['from'] })
  .refine((v) => v.to <= addDays(v.from, 62), { message: 'Choose at most two months at a time', path: ['to'] });

const writeSchema = z
  .object({
    record: z.record(z.string(), z.unknown()),
    /** The version the editor loaded; journal text uses it to detect edits made elsewhere. */
    baseSeq: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export function ownerRouter(): Router {
  const router = Router();

  /**
   * Everything needed to edit a date range: all definitions (habits, questions,
   * identities, emotions) and the dated records inside the range.
   */
  router.get('/data', validateQuery(rangeSchema), async (req, res) => {
    const c = ownerCtx(req);
    const { from, to } = res.locals.query as { from: string; to: string };
    const uid = c.ownerUserId;
    const today = localDateIn(new Date(), c.timezone);
    await ensureOccurrencesFor(uid, addDays(from, -1), to, today);
    const inRange = ' AND local_date BETWEEN ? AND ?';
    const [habits, journalQuestions, identities, emotionOptions, dailyRoutines, habitLogs, urges, planTasks, timeBlocks, planGoals, planReviews] =
      await Promise.all([
        rows('habits', uid),
        rows('journalQuestions', uid),
        rows('identities', uid),
        rows('emotionOptions', uid),
        rows('dailyRoutines', uid, inRange, [from, to]),
        rows('habitLogs', uid, inRange, [from, to]),
        rows('urges', uid, inRange, [from, to]),
        rows('planTasks', uid, inRange, [addDays(from, -1), to]),
        rows('timeBlocks', uid, inRange, [from, to]),
        rows('planGoals', uid, ' AND period_start BETWEEN ? AND ?', [addDays(monthStartOf(from), -6), to]),
        rows('planReviews', uid, ' AND period_start BETWEEN ? AND ?', [addDays(monthStartOf(from), -6), to]),
      ]);
    const routineIds = dailyRoutines.map((r) => r.id);
    const journalAnswers = routineIds.length
      ? await rows('journalAnswers', uid, ` AND routine_id IN (${routineIds.map(() => '?').join(',')})`, routineIds)
      : [];
    res.json({
      data: {
        userId: uid,
        today,
        records: {
          habits,
          journalQuestions,
          identities,
          emotionOptions,
          dailyRoutines,
          habitLogs,
          journalAnswers,
          urges,
          planTasks,
          timeBlocks,
          planGoals,
          planReviews,
        },
      },
    });
  });

  // ---------------------------------------------------------------- repeats

  /** Starts a repeating block or task. */
  router.post(
    '/series',
    validateBody(z.object({ kind: kindSchema, startDate: localDateSchema, fields: fieldsSchema, repeat: repeatSchema }).strict()),
    async (req, res) => {
      const c = ownerCtx(req);
      const b = req.body as { kind: 'block' | 'task'; startDate: string; fields: z.infer<typeof fieldsSchema>; repeat: z.infer<typeof repeatSchema> };
      const id = await createSeriesFor(c.ownerUserId, b.kind, b.startDate, b.fields, b.repeat, localDateIn(new Date(), c.timezone));
      res.status(201).json({ data: { id } });
    },
  );

  /** Edits an occurrence: this one only, or this and the following ones. */
  router.post(
    '/occurrence/edit',
    validateBody(
      z.object({ kind: kindSchema, id: z.string().uuid(), scope: scopeSchema, date: localDateSchema, fields: fieldsSchema, repeat: repeatSchema.nullable() }).strict(),
    ),
    async (req, res) => {
      const c = ownerCtx(req);
      const b = req.body as { kind: 'block' | 'task'; id: string; scope: 'one' | 'following'; date: string; fields: z.infer<typeof fieldsSchema>; repeat: z.infer<typeof repeatSchema> | null };
      await editOccurrenceFor(c.ownerUserId, b.kind, b.id, { date: b.date, fields: b.fields, repeat: b.repeat }, b.scope, localDateIn(new Date(), c.timezone));
      res.json({ data: { ok: true } });
    },
  );

  /** Deletes an occurrence: this one only, or this and the following ones. */
  router.post('/occurrence/delete', validateBody(z.object({ kind: kindSchema, id: z.string().uuid(), scope: scopeSchema }).strict()), async (req, res) => {
    const c = ownerCtx(req);
    const b = req.body as { kind: 'block' | 'task'; id: string; scope: 'one' | 'following' };
    await deleteOccurrenceFor(c.ownerUserId, b.kind, b.id, b.scope);
    res.json({ data: { ok: true } });
  });

  /** Creates, updates or (with deletedAt) deletes one record. */
  router.put('/records/:entity', validateBody(writeSchema), async (req: Request, res: Response, next: NextFunction) => {
    const c = ownerCtx(req);
    const entity = req.params.entity;
    if (!isEntityName(entity) || !EDITABLE.includes(entity)) return next(notFound());
    const { record, baseSeq } = req.body as z.infer<typeof writeSchema>;
    const id = typeof record.id === 'string' ? record.id : '';
    const now = new Date();
    const outcome = await withTransaction(async (conn) => {
      const existing = id ? await findRecord(conn, entity, c.ownerUserId, id, { includeDeleted: true }) : undefined;
      // The server's clock decides, and always lands after the stored version.
      const updatedAt = new Date(Math.max(now.getTime(), existing ? Date.parse(existing.updatedAt) + 1 : 0)).toISOString();
      const full = {
        ...record,
        createdAt: existing?.createdAt ?? now.toISOString(),
        updatedAt,
        deletedAt: record.deletedAt ? updatedAt : null,
      };
      try {
        const r = await applyRecord(conn, c.ownerUserId, entity, full, { now, baseSeq: baseSeq ?? undefined });
        const stored = await findRecord(conn, entity, c.ownerUserId, id, { includeDeleted: true });
        return { r, stored };
      } catch (err) {
        const code = constraintErrorCode(err);
        if (code === 'MISSING_PARENT') throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Something this depends on no longer exists. Reload the page.');
        if (code) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'That change is not valid.');
        throw err;
      }
    });
    const { r, stored } = outcome;
    if (r.status === 'rejected') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, r.details?.[0]?.message ?? 'That change is not valid.', r.details);
    }
    if (r.status === 'conflict') {
      return void res.status(409).json({
        error: { code: ErrorCode.CONFLICT, message: 'This was changed on another device. Reload to see the latest version.' },
        record: r.serverRecord,
      });
    }
    if (r.status === 'stale') {
      // e.g. editing something deleted on the phone.
      throw new AppError(409, ErrorCode.CONFLICT, 'This was changed or removed on another device. Reload the page.');
    }
    if (entity === 'timeBlocks') notifyBlocksChanged(c.ownerUserId);
    res.json({ data: stored });
  });

  return router;
}
