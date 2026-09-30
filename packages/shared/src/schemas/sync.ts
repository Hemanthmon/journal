import { z } from 'zod';
import type { EntityName } from '../entities';
import { idSchema } from './common';

export const MAX_PUSH_CHANGES = 200;
export const MAX_PULL_LIMIT = 1000;

export const pushRequestSchema = z
  .object({
    /** The data epoch the client last synced with (see PullResponse.epoch). */
    epoch: z.number().int().min(1),
    changes: z
      .array(
        z
          .object({
            /** Unique per change attempt; retrying the same change reuses it (idempotency key). */
            changeId: idSchema,
            entity: z.string(),
            /**
             * The server_seq of the record the client last saw (null if it never came from
             * the server). Used to detect concurrent edits to journal text.
             */
            baseSeq: z.number().int().min(0).nullable(),
            /** The full record. A deletion is a record with `deletedAt` set. */
            record: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(MAX_PUSH_CHANGES),
  })
  .strict();
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type PushChange = PushRequest['changes'][number];

/**
 * applied   the server now holds this record (serverSeq is its new version)
 * stale     the server kept a newer version; `record` is the server's copy
 * conflict  journal text edited on two devices; `record` is the server's copy, nothing overwritten
 * rejected  invalid, or refers to something that doesn't exist; will not succeed on retry
 */
export type PushStatus = 'applied' | 'stale' | 'conflict' | 'rejected';

export interface PushResult {
  changeId: string;
  status: PushStatus;
  serverSeq?: number;
  record?: Record<string, unknown> & { serverSeq: number };
  errorCode?: 'INVALID' | 'MISSING_PARENT' | 'DUPLICATE' | 'ID_CONFLICT' | 'UNKNOWN_ENTITY';
  details?: { path: string; message: string }[];
}

export interface PushResponse {
  epoch: number;
  results: PushResult[];
}

export const pullQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_LIMIT).default(500),
});

export interface PullChange {
  entity: EntityName;
  record: Record<string, unknown> & { serverSeq: number };
}

export interface PullResponse {
  /**
   * Increments when the user deletes all their data. A client holding a different epoch
   * must discard its local copy and pull from cursor 0.
   */
  epoch: number;
  changes: PullChange[];
  nextCursor: number;
  hasMore: boolean;
}
