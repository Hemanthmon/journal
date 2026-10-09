import { Router, type NextFunction, type Request, type Response } from 'express';
import { addDays, blockInputSchema, dashboardRangeSchema, ErrorCode, localDateSchema, weekStartOf, type BlockInput, type DashboardMe } from '@journal/shared';
import { AppError, notFound } from '../../lib/errors';
import { localDateIn } from '../../lib/tz';
import { requireIdParam } from '../../lib/rows';
import { validateBody, validateQuery } from '../../middleware/validate';
import { calendarView, createBlockFor, deleteBlockFor, updateBlockFor } from '../calendar/blocks';
import { ensureOccurrencesFor } from '../calendar/series';
import { Analyzer, firstDataDate, resolveRange } from './analytics';
import { dashboardAuthRouter, requireDashboard, type DashboardContext } from './auth';
import { loadOwnerData } from './data';
import { buildWorkbook } from './export';
import { ownerRouter } from './owner';
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
      isOwner: c.isOwner,
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
    await ensureOccurrencesFor(c.ownerUserId, weekStartOf(q), addDays(weekStartOf(q), 6), today);
    res.json({ data: buildPlanner(await loadPlannerData(c.ownerUserId), today, q) });
  });

  /** Blocks and timed tasks between ?from and ?to (default: the owner's current week). */
  router.get('/calendar', range, async (req, res) => {
    const c = ctx(req);
    const today = localDateIn(new Date(), c.timezone);
    const q = (res.locals.query ?? {}) as { from?: string; to?: string };
    const from = q.from ?? weekStartOf(today);
    const to = q.to ?? addDays(from, 6);
    if (to > addDays(from, 62)) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Choose at most two months at a time');
    await ensureOccurrencesFor(c.ownerUserId, from, to, today);
    res.json({ data: await calendarView(c.ownerUserId, { from, to, today, canEdit: c.isOwner }) });
  });

  // Calendar blocks are the one thing the owner can change from the website.
  const ownerOnly = (req: Request, _res: Response, next: NextFunction) => {
    if (!ctx(req).isOwner) return next(new AppError(403, ErrorCode.FORBIDDEN, 'Only the owner can change the calendar'));
    next();
  };

  router.post('/blocks', ownerOnly, validateBody(blockInputSchema), async (req, res) => {
    const b = await createBlockFor(ctx(req).ownerUserId, req.body as BlockInput);
    res.status(201).json({ data: { id: b.id } });
  });

  router.put('/blocks/:id', requireIdParam, ownerOnly, validateBody(blockInputSchema), async (req, res) => {
    const b = await updateBlockFor(ctx(req).ownerUserId, req.params.id as string, req.body as BlockInput);
    res.json({ data: { id: b.id } });
  });

  router.delete('/blocks/:id', requireIdParam, ownerOnly, async (req, res) => {
    await deleteBlockFor(ctx(req).ownerUserId, req.params.id as string);
    res.status(204).end();
  });

  // The owner's full editor (journal, habits, urges, planner).
  router.use('/owner', ownerRouter());

  /** The website pings this every minute while visible, so visits measure time spent. */
  router.post('/heartbeat', (_req, res) => {
    res.status(204).end();
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
