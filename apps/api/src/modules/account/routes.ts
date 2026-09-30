import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { confirmPasswordSchema, ErrorCode } from '@journal/shared';
import { withTransaction } from '../../db/tx';
import { AppError, unauthenticated } from '../../lib/errors';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { findUserById, seedDefaultQuestions } from '../auth/repo';

async function verifyPassword(conn: PoolConnection, userId: string, password: string) {
  const user = await findUserById(conn, userId);
  if (!user) throw unauthenticated();
  if (!(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Incorrect password');
  }
}

/**
 * History tables use RESTRICT foreign keys to protect records, so they're removed
 * explicitly, children first, before their parents.
 */
async function deleteUserRecords(conn: PoolConnection, userId: string) {
  for (const table of [
    'journal_answers',
    'habit_logs',
    'daily_routines',
    'journal_questions',
    'habits',
    'urge_records',
    'processed_changes',
  ]) {
    await conn.execute(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
}

export function accountRouter(): Router {
  const router = Router();

  /** Permanently deletes the account and everything in it. */
  router.delete('/', validateBody(confirmPasswordSchema), async (req, res) => {
    const userId = requireUserId(req);
    await withTransaction(async (conn) => {
      await verifyPassword(conn, userId, req.body.password);
      await deleteUserRecords(conn, userId);
      await conn.execute('DELETE FROM users WHERE id = ?', [userId]); // cascades refresh tokens
    });
    res.status(204).end();
  });

  /**
   * Deletes all personal data but keeps the account (with fresh default questions).
   * Bumps the data epoch so every device discards its local copy.
   */
  router.delete('/data', validateBody(confirmPasswordSchema), async (req, res) => {
    const userId = requireUserId(req);
    const epoch = await withTransaction(async (conn) => {
      await verifyPassword(conn, userId, req.body.password);
      await deleteUserRecords(conn, userId);
      await conn.execute('UPDATE users SET data_epoch = data_epoch + 1, updated_at = ? WHERE id = ?', [
        new Date(),
        userId,
      ]);
      await seedDefaultQuestions(conn, userId, new Date());
      const [rows] = await conn.execute<RowDataPacket[]>('SELECT data_epoch FROM users WHERE id = ?', [userId]);
      return Number(rows[0]?.data_epoch);
    });
    res.json({ data: { epoch } });
  });

  return router;
}
