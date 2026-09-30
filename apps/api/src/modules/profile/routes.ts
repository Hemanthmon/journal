import { Router } from 'express';
import { updateProfileSchema, type ApiSuccess, type PublicUser, type UpdateProfileInput } from '@journal/shared';
import { getPool } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { findUserById, toPublicUser } from '../auth/repo';

/** Mounted behind `authenticate`; every query is scoped to the caller's own user id. */
export function profileRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const user = await findUserById(getPool(), requireUserId(req));
    if (!user) throw notFound('User not found');
    const body: ApiSuccess<PublicUser> = { data: toPublicUser(user) };
    res.json(body);
  });

  router.patch('/', validateBody(updateProfileSchema), async (req, res) => {
    const userId = requireUserId(req);
    const input = req.body as UpdateProfileInput;
    const db = getPool();
    await db.execute(
      `UPDATE users
          SET name = COALESCE(?, name), timezone = COALESCE(?, timezone), updated_at = ?
        WHERE id = ?`,
      [input.name ?? null, input.timezone ?? null, new Date(), userId],
    );
    const user = await findUserById(db, userId);
    if (!user) throw notFound('User not found');
    const body: ApiSuccess<PublicUser> = { data: toPublicUser(user) };
    res.json(body);
  });

  return router;
}
