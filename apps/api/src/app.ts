import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config/env';
import { authenticate } from './middleware/authenticate';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger, requireHttps } from './middleware/security';
import { accountRouter } from './modules/account/routes';
import { authRouter } from './modules/auth/routes';
import { dashboardRouter } from './modules/dashboard/routes';
import { dashboardSharingRouter } from './modules/dashboard/sharing';
import { dailyRoutinesRouter } from './modules/dailyRoutines/routes';
import { habitLogsRouter } from './modules/habitLogs/routes';
import { habitsRouter } from './modules/habits/routes';
import { journalAnswersRouter } from './modules/journalAnswers/routes';
import { journalQuestionsRouter } from './modules/journalQuestions/routes';
import { profileRouter } from './modules/profile/routes';
import { syncRouter } from './modules/sync/routes';
import { googleRouter } from './modules/google/routes';
import { urgeSupportRouter } from './modules/urgeSupport/routes';
import { urgesRouter } from './modules/urges/routes';

export interface AppOptions {
  authRateLimitMax?: number;
}

export function createApp(opts: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(requireHttps(config.isProduction));
  // Native apps don't send an Origin header and aren't affected by CORS. Browser origins
  // are allowed only if explicitly listed.
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  // Sync batches can carry long journal entries.
  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  app.use('/api/auth', authRouter({ rateLimitMax: opts.authRateLimitMax ?? config.auth.rateLimitMax }));

  // Everything below requires a valid access token and only ever touches the caller's data.
  app.use('/api/profile', authenticate, profileRouter());
  app.use('/api/account', authenticate, accountRouter());
  app.use('/api/habits', authenticate, habitsRouter());
  app.use('/api/habit-logs', authenticate, habitLogsRouter());
  app.use('/api/journal-questions', authenticate, journalQuestionsRouter());
  app.use('/api/journal-answers', authenticate, journalAnswersRouter());
  app.use('/api/daily-routines', authenticate, dailyRoutinesRouter());
  app.use('/api/urges', authenticate, urgesRouter());
  app.use('/api/sync', authenticate, syncRouter());
  app.use('/api/dashboard-access', authenticate, dashboardSharingRouter());
  app.use('/api/urge-support', authenticate, urgeSupportRouter());
  // Google Calendar connection (the OAuth start/callback pages are opened in a browser).
  app.use('/api/google', googleRouter());

  // Read-only web dashboard API (its own email-code sessions; see modules/dashboard).
  app.use('/api/dashboard', dashboardRouter({ rateLimitMax: opts.authRateLimitMax ?? config.auth.rateLimitMax }));

  // The dashboard web app (apps/web) is served from the same origin as the API, so its
  // session cookie is first-party and SameSite=Strict, and no CORS is needed.
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
