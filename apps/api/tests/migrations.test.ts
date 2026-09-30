import type { RowDataPacket } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { getPool } from '../src/db/pool';
import { migrate } from '../src/db/migrate';

describe('migrations', () => {
  it('creates every table', async () => {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    const names = rows.map((r) => r.name as string);
    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'refresh_tokens',
        'habits',
        'habit_logs',
        'daily_routines',
        'journal_questions',
        'journal_answers',
        'urge_records',
        'processed_changes',
        'default_journal_questions',
        'schema_migrations',
      ]),
    );
  });

  it('records applied migrations and is a no-op when re-run', async () => {
    const result = await migrate();
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['001_init.sql', '002_default_questions.sql', '003_data_epoch.sql']);
  });

  it('seeds the four default questions in order', async () => {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT text, type, system_key FROM default_journal_questions ORDER BY display_order',
    );
    expect(rows.map((r) => [r.text, r.type, r.system_key])).toEqual([
      ['How was your day? Tell us about it.', 'text', 'day'],
      ['How are you feeling today?', 'emoji', 'mood'],
      ["What's one thing you could do better tomorrow?", 'text', 'tomorrow'],
      ['What are you grateful for today?', 'text', 'gratitude'],
    ]);
  });

  it('indexes every synced table by (user_id, server_seq) for incremental pulls', async () => {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT DISTINCT table_name AS t FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND column_name = 'server_seq' AND seq_in_index = 2`,
    );
    expect(rows.map((r) => r.t as string).sort()).toEqual([
      'daily_routines',
      'habit_logs',
      'habits',
      'journal_answers',
      'journal_questions',
      'urge_records',
    ]);
  });
});
