import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { ErrorCode, dailyRoutineId, highlightInputSchema, journalAnswerId, localDateSchema, type Highlight, type HighlightInput } from '@journal/shared';
import { getPool } from '../../db/pool';
import { AppError, notFound } from '../../lib/errors';
import { validateBody, validateQuery } from '../../middleware/validate';
import type { DashboardContext } from './auth';

/**
 * Highlights on the diary pages. Anyone signed in to the owner's dashboard (viewers and
 * the owner) can highlight a passage of a journal answer or a whole urge, with a note.
 * They are annotations: the journal itself is never changed. Authors remove their own;
 * the owner can remove any.
 */

type Row = RowDataPacket & Record<string, unknown>;

const MAX_PER_DAY_PER_AUTHOR = 50;

function ctx(req: Request): DashboardContext {
  if (!req.dashboard) throw notFound();
  return req.dashboard;
}

function toHighlight(r: Row, c: DashboardContext): Highlight {
  const authorIsOwner = r.grant_id === null;
  return {
    id: String(r.id),
    kind: r.kind as Highlight['kind'],
    date: (r.local_date as Date | string) instanceof Date ? (r.local_date as Date).toISOString().slice(0, 10) : String(r.local_date).slice(0, 10),
    targetId: String(r.target_id),
    quote: r.quote ? String(r.quote) : null,
    start: r.start_offset === null ? null : Number(r.start_offset),
    end: r.end_offset === null ? null : Number(r.end_offset),
    note: r.note ? String(r.note) : null,
    author: authorIsOwner ? (c.isOwner ? 'You' : c.ownerName) : String(r.author_name ?? r.author_email),
    authorIsOwner,
    mine: c.isOwner ? authorIsOwner : r.grant_id === c.grantId,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

/** The highlighted thing must exist in the owner's journal on that date. */
async function checkTarget(c: DashboardContext, h: HighlightInput) {
  if (h.kind === 'urge') {
    const [rows] = await getPool().execute<Row[]>(
      'SELECT id FROM urge_records WHERE id = ? AND user_id = ? AND local_date = ? AND deleted_at IS NULL',
      [h.targetId, c.ownerUserId, h.date],
    );
    if (!rows[0]) throw notFound('That urge is no longer there. Reload the page.');
    return;
  }
  const id = journalAnswerId(c.ownerUserId, h.date, h.targetId);
  const [rows] = await getPool().execute<Row[]>(
    'SELECT text_value FROM journal_answers WHERE id = ? AND user_id = ? AND routine_id = ? AND deleted_at IS NULL',
    [id, c.ownerUserId, dailyRoutineId(c.ownerUserId, h.date)],
  );
  const text = rows[0]?.text_value ? String(rows[0].text_value) : null;
  if (!text) throw notFound('That journal entry is no longer there. Reload the page.');
  // The quote must be what's at those positions (the text may have changed since).
  if (text.slice(h.start!, h.end!) !== h.quote) {
    throw new AppError(409, ErrorCode.CONFLICT, 'This entry changed since the page loaded. Reload and highlight again.');
  }
}

export function highlightsRouter(): Router {
  const router = Router();

  /** Highlights for one date, or a date range. */
  router.get(
    '/',
    validateQuery(z.object({ from: localDateSchema, to: localDateSchema }).refine((v) => v.from <= v.to, { path: ['from'], message: '`from` must not be after `to`' })),
    async (req, res) => {
      const c = ctx(req);
      const { from, to } = res.locals.query as { from: string; to: string };
      const [rows] = await getPool().execute<Row[]>(
        'SELECT * FROM dashboard_highlights WHERE owner_user_id = ? AND local_date BETWEEN ? AND ? ORDER BY created_at',
        [c.ownerUserId, from, to],
      );
      const data: Highlight[] = rows.map((r) => toHighlight(r, c));
      res.json({ data });
    },
  );

  router.post('/', validateBody(highlightInputSchema), async (req, res) => {
    const c = ctx(req);
    const h = req.body as HighlightInput;
    await checkTarget(c, h);
    const [count] = await getPool().execute<Row[]>(
      'SELECT COUNT(*) AS n FROM dashboard_highlights WHERE owner_user_id = ? AND local_date = ? AND author_email = ?',
      [c.ownerUserId, h.date, c.viewerEmail],
    );
    if (Number(count[0]?.n ?? 0) >= MAX_PER_DAY_PER_AUTHOR) {
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'That is a lot of highlights for one day. Remove some first.');
    }
    if (h.kind === 'urge') {
      const [dupe] = await getPool().execute<Row[]>(
        "SELECT id FROM dashboard_highlights WHERE owner_user_id = ? AND kind = 'urge' AND target_id = ? AND author_email = ?",
        [c.ownerUserId, h.targetId, c.viewerEmail],
      );
      if (dupe[0]) throw new AppError(409, ErrorCode.CONFLICT, 'You already highlighted this urge.');
    }
    const id = randomUUID();
    await getPool().execute(
      `INSERT INTO dashboard_highlights
         (id, owner_user_id, grant_id, author_email, author_name, kind, local_date, target_id, quote, start_offset, end_offset, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        c.ownerUserId,
        c.grantId,
        c.viewerEmail,
        c.isOwner ? c.ownerName : c.viewerName,
        h.kind,
        h.date,
        h.targetId,
        h.kind === 'answer' ? (h.quote ?? null) : null,
        h.kind === 'answer' ? (h.start ?? null) : null,
        h.kind === 'answer' ? (h.end ?? null) : null,
        h.note || null,
        new Date(),
      ],
    );
    const [rows] = await getPool().execute<Row[]>('SELECT * FROM dashboard_highlights WHERE id = ?', [id]);
    res.status(201).json({ data: toHighlight(rows[0]!, c) });
  });

  router.delete('/:id', async (req, res) => {
    const c = ctx(req);
    const [rows] = await getPool().execute<Row[]>('SELECT * FROM dashboard_highlights WHERE id = ? AND owner_user_id = ?', [req.params.id, c.ownerUserId]);
    const r = rows[0];
    if (!r) throw notFound('Highlight not found');
    if (!toHighlight(r, c).mine && !c.isOwner) throw new AppError(403, ErrorCode.FORBIDDEN, "You can only remove your own highlights");
    await getPool().execute('DELETE FROM dashboard_highlights WHERE id = ?', [r.id]);
    res.status(204).end();
  });

  return router;
}
