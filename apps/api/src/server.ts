import { createApp } from './app';
import { config } from './config/env';
import { closePool } from './db/pool';
import { describeError, logger } from './lib/logger';
import { syncEnvAccess } from './modules/dashboard/access';

const server = createApp().listen(config.port, () => {
  logger.info('api_started', { port: config.port, env: config.nodeEnv });
  // Apply DASHBOARD_VIEWER_EMAIL / DASHBOARD_OWNER_EMAIL to the access table.
  syncEnvAccess().then(
    () => logger.info('dashboard_access_synced', { enabled: config.dashboard.enabled }),
    (err: unknown) => logger.error('dashboard_access_sync_failed', describeError(err)),
  );
});

function shutdown(signal: string) {
  logger.info('api_stopping', { signal });
  server.close(() => {
    closePool()
      .catch((err: unknown) => logger.error('pool_close_failed', describeError(err)))
      .finally(() => process.exit(0));
  });
  // Don't hang forever on open keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
