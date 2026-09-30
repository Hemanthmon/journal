import type { RowDataPacket } from 'mysql2/promise';
import { ENTITIES, type EntityName, type EntityRecordMap } from '@journal/shared';
import { getPool } from '../../db/pool';
import { localDateIn } from '../../lib/tz';
import { rowToRecord } from '../../records/records';
import type { OwnerData } from './analytics';
import type { DashboardContext } from './auth';

type Row = RowDataPacket & Record<string, unknown>;

/** All of one entity for the owner. Deleted rows are only needed for definitions (history). */
async function load<E extends EntityName>(entity: E, userId: string, includeDeleted: boolean) {
  const def = ENTITIES[entity];
  const [rows] = await getPool().query<Row[]>(
    `SELECT server_seq, ${def.fields.map((f) => f.col).join(', ')} FROM ${def.table}
      WHERE user_id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`,
    [userId],
  );
  return rows.map((r) => rowToRecord(entity, r) as unknown as EntityRecordMap[E]);
}

/**
 * Loads the dashboard owner's records. A personal journal is small (thousands of rows at
 * most), so everything is loaded and filtered in memory; queries stay simple and the
 * analytics stay pure.
 */
export async function loadOwnerData(ctx: DashboardContext): Promise<OwnerData> {
  const uid = ctx.ownerUserId;
  const [habits, logs, routines, answers, questions, urges] = await Promise.all([
    load('habits', uid, true),
    load('habitLogs', uid, false),
    load('dailyRoutines', uid, false),
    load('journalAnswers', uid, false),
    load('journalQuestions', uid, true),
    load('urges', uid, false),
  ]);
  return {
    timezone: ctx.timezone,
    today: localDateIn(new Date(), ctx.timezone),
    habits,
    logs,
    routines,
    answers,
    questions,
    urges,
  };
}
