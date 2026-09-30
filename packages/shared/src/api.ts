/**
 * Every API response is either `{ data }` or `{ error }`.
 * Error codes are stable strings the client can branch on; messages are for humans.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  /** The user deleted all their data elsewhere; the client must reset its local copy. */
  EPOCH_CHANGED: 'EPOCH_CHANGED',
  RATE_LIMITED: 'RATE_LIMITED',
  HTTPS_REQUIRED: 'HTTPS_REQUIRED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Field-level validation issues. Never contains submitted values. */
    details?: { path: string; message: string }[];
  };
}

export interface ApiSuccess<T> {
  data: T;
}
