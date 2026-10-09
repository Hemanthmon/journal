import { Router, type Request } from 'express';
import { ErrorCode, shareDashboardSchema, type ApiSuccess, type DashboardViewer, type ShareDashboardInput } from '@journal/shared';
import { getPool } from '../../db/pool';
import { AppError } from '../../lib/errors';
import { requireUserId } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { findUserById } from '../auth/repo';
import { listViewers, revokeViewer, shareAccess } from './access';
import { getMailer, logMailFailure } from './mailer';

/** The dashboard is served by this same server, so its address is the one the app called. */
const dashboardUrl = (req: Request) => `${req.protocol}://${req.get('host')}/`;

/**
 * Lets the owner choose, from the app, who can see their read-only web dashboard.
 * Mounted behind `authenticate`; every query is scoped to the caller's own user id.
 */
export function dashboardSharingRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const body: ApiSuccess<DashboardViewer[]> = { data: await listViewers(getPool(), requireUserId(req)) };
    res.json(body);
  });

  router.post('/', validateBody(shareDashboardSchema), async (req, res) => {
    const userId = requireUserId(req);
    const input = req.body as ShareDashboardInput;
    const me = await findUserById(getPool(), userId);
    if (me?.email === input.email) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, "That's your own email. Sign in to the website with it to see and edit your journal.");
    }
    const { viewer, created } = await shareAccess(userId, input);
    if (created) {
      const owner = await findUserById(getPool(), userId);
      getMailer()
        .sendInvite(input.email, { viewerName: input.name, ownerName: owner?.name ?? 'Your friend', dashboardUrl: dashboardUrl(req) })
        .catch(logMailFailure);
    }
    const body: ApiSuccess<DashboardViewer> = { data: viewer };
    res.status(created ? 201 : 200).json(body);
  });

  router.delete('/:id', async (req, res) => {
    await revokeViewer(requireUserId(req), String(req.params.id));
    res.status(204).end();
  });

  return router;
}
