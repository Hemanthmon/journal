import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import type { ApiSuccess } from '@journal/shared';
import { withTransaction } from '../../db/tx';
import { notFound } from '../../lib/errors';
import { requireUserId } from '../../middleware/authenticate';
import { findUserById } from '../auth/repo';
import { getMailer, logMailFailure } from '../dashboard/mailer';
import { pickNote } from './notes';

/** Enough for a hard evening; keeps a stuck button from flooding the inbox. */
export const MAX_NOTES_PER_HOUR = 6;

export interface UrgeNoteResult {
  sent: boolean;
  /** The note's title, shown in the app ("On its way: …"). */
  title?: string;
  reason?: 'limit';
}

/**
 * When the user opens the breathing exercise for an urge, email them one short note to
 * read afterwards. Mounted behind `authenticate`; only ever emails the caller's own address.
 */
export function urgeSupportRouter(): Router {
  const router = Router();

  router.post('/note', async (req, res) => {
    const userId = requireUserId(req);
    const outcome = await withTransaction(async (conn) => {
      const user = await findUserById(conn, userId);
      if (!user) throw notFound('User not found');
      // Serialise per user so two taps can't both pass the limit or pick the same note.
      await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      const now = new Date();
      const [recent] = await conn.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS n FROM urge_notes WHERE user_id = ? AND sent_at > ?',
        [userId, new Date(now.getTime() - 3600_000)],
      );
      if (Number(recent[0]?.n ?? 0) >= MAX_NOTES_PER_HOUR) return { user, picked: null };
      const [total] = await conn.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM urge_notes WHERE user_id = ?', [userId]);
      const picked = pickNote(userId, Number(total[0]?.n ?? 0));
      await conn.execute('INSERT INTO urge_notes (id, user_id, note_index, sent_at) VALUES (?, ?, ?, ?)', [
        randomUUID(),
        userId,
        picked.index,
        now,
      ]);
      return { user, picked };
    });

    let body: ApiSuccess<UrgeNoteResult>;
    if (!outcome.picked) {
      body = { data: { sent: false, reason: 'limit' } };
    } else {
      // Not awaited: the breathing exercise shouldn't wait on the email provider.
      getMailer().sendUrgeNote(outcome.user.email, { name: outcome.user.name, note: outcome.picked.note }).catch(logMailFailure);
      body = { data: { sent: true, title: outcome.picked.note.title } };
    }
    res.json(body);
  });

  return router;
}
