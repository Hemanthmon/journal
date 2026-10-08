import { Router, type NextFunction, type Request, type Response } from 'express';
import { dashboardRangeSchema, localDateSchema, type DashboardMe } from '@journal/shared';
import { notFound } from '../../lib/errors';
import { localDateIn } from '../../lib/tz';
import { requireIdParam } from '../../lib/rows';
import { validateQuery } from '../../middleware/validate';
import { Analyzer, firstDataDate, resolveRange } from './analytics';
import { dashboardAuthRouter, requireDashboard, type DashboardContext } from './auth';
import { loadOwnerData } from './data';
import { buildWorkbook } from './export';
import { buildPlanner, loadPlannerData } from './planner';

/**
 * Read-only web dashboard API. Every data route requires a dashboard session and serves
 * only the owner linked to that session's active grant. There are no write routes.
 */

function ctx(req: Request): DashboardContext {
  if (!req.dashboard) throw notFound();
  return req.dashboard;
}

async function analyzer(req: Request, res: Response) {
  const data = await loadOwnerData(ctx(req));
  const a = new Analyzer(data);
  const q = (res.locals.query ?? {}) as { from?: string; to?: string };
  const range = resolveRange(q, data.today, firstDataDate(data));
  return { a, data, range };
}

function noStore(_req: Request, res: Response, next: NextFunction) {
  // Personal data: never cache in browsers or proxies.
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function dashboardRouter(opts: { rateLimitMax: number }): Router {
  const router = Router();
  router.use(noStore);
  router.use('/auth', dashboardAuthRouter(opts));

  router.use(requireDashboard);
  const range = validateQuery(dashboardRangeSchema);

  router.get('/me', async (req, res) => {
    const c = ctx(req);
    const data = await loadOwnerData(c);
    const me: DashboardMe = {
      viewerEmail: c.viewerEmail,
      ownerName: c.ownerName,
      timezone: c.timezone,
      today: data.today,
      firstDate: firstDataDate(data),
    };
    res.json({ data: me });
  });

  router.get('/overview', range, async (req, res) => {
    const { a, range: r } = await analyzer(req, res);
    res.json({ data: a.overview(r) });
  });

  router.get('/habits', range, async (req, res) => {
    const { a, range: r } = await analyzer(req, res);
    res.json({ data: { range: r, habits: a.habitSummaries(r) } });
  });

  router.get('/habits/:id', requireIdParam, range, async (req, res) => {
    const { a, range: r } = await analyzer(req, res);
    const detail = a.habitDetail(req.params.id as string, r);
    if (!detail) throw notFound('Habit not found');
    res.json({ data: { range: r, habit: detail } });
  });

  router.get('/days', range, async (req, res) => {
    const { a, range: r } = await analyzer(req, res);
    res.json({ data: { range: r, days: a.daySummaries(r) } });
  });

  router.get('/days/:date', async (req, res) => {
    if (!localDateSchema.safeParse(req.params.date).success) throw notFound();
    const { a } = await analyzer(req, res);
    res.json({ data: a.dayDetail(req.params.date as string) });
  });

  router.get('/urges', range, async (req, res) => {
    const { a, range: r } = await analyzer(req, res);
    res.json({ data: a.urgeAnalytics(r) });
  });

  /** The planner for the week containing `?date=` (default: the owner's today). */
  router.get('/planner', async (req, res) => {
    const c = ctx(req);
    const today = localDateIn(new Date(), c.timezone);
    const q = typeof req.query.date === 'string' && localDateSchema.safeParse(req.query.date).success ? req.query.date : today;
    res.json({ data: buildPlanner(await loadPlannerData(c.ownerUserId), today, q) });
  });

  router.get('/export.xlsx', range, async (req, res) => {
    const { a, range: r } = await analyzer(req, res);
    const file = await buildWorkbook(a, r, ctx(req).ownerName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="journal-${r.from}-to-${r.to}.xlsx"`);
    res.send(file);
  });

  return router;
}
