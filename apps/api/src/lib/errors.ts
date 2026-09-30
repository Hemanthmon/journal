import { ErrorCode } from '@journal/shared';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthenticated = (message = 'Authentication required') =>
  new AppError(401, ErrorCode.UNAUTHENTICATED, message);

export const notFound = (message = 'Not found') => new AppError(404, ErrorCode.NOT_FOUND, message);

/** mysql2 errors carry a `code` such as 'ER_DUP_ENTRY'. */
export function isMysqlError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;
}
