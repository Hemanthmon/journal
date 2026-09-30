import { createApp } from './app';
import { config } from './config/env';
import { closePool } from './db/pool';
import { describeError, logger } from './lib/logger';

const server = createApp().listen(config.port, () => {
  logger.info('api_started', { port: config.port, env: config.nodeEnv });
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
