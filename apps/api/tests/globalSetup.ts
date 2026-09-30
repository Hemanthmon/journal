import mysql, { type RowDataPacket } from 'mysql2/promise';
// vitest.config.mts sets NODE_ENV=test before this loads, so config reads .env.test.
import { config } from '../src/config/env';
import { migrate } from '../src/db/migrate';

/** Drops every table in the test database and migrates it from scratch. */
export default async function globalSetup() {
  if (!config.db.database.endsWith('_test')) {
    throw new Error(`Refusing to reset "${config.db.database}": test database name must end in "_test".`);
  }

  const conn = await mysql.createConnection(config.db);
  try {
    const [tables] = await conn.query<RowDataPacket[]>(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables) await conn.query(`DROP TABLE IF EXISTS \`${String(t.name)}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end();
  }

  await migrate();
}
