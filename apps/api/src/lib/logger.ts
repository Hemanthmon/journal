import { config } from '../config/env';

type Fields = Record<string, string | number | boolean | null | undefined>;

/**
 * Deliberately tiny structured logger.
 *
 * PRIVACY RULE: only log operational metadata (method, path, status, timings, error
 * codes). Never pass request bodies, journal text, urge records, tokens, passwords,
 * emails or SQL parameter values. The `Fields` type only accepts scalars to make
 * accidentally logging a whole object harder.
 */
function write(level: 'info' | 'warn' | 'error', msg: string, fields?: Fields) {
  if (config.isTest) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};

/**
 * Describes an unexpected error without its message, which may embed user data
 * (e.g. MySQL's "Duplicate entry 'someone@example.com' for key ..."). The stack's
 * frames are kept; its first line (the message) is dropped.
 */
export function describeError(err: unknown): Fields {
  if (!(err instanceof Error)) return { errorType: typeof err };
  const code = (err as { code?: unknown }).code;
  return {
    errorName: err.name,
    errorCode: typeof code === 'string' ? code : undefined,
    stack: config.isProduction ? undefined : err.stack?.split('\n').slice(1, 8).join('\n'),
  };
}
