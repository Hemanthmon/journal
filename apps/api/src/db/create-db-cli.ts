/**
 * Creates the configured database if it doesn't exist (useful for hosted MySQL, where
 * the provider only creates a default database).
 *
 *   npm run db:create            -> database from .env
 *   npm run db:create -- --test  -> database from .env.test
 */
import './cli-env'; // must stay first
import mysql from 'mysql2/promise';
import { config } from '../config/env';

async function main() {
  const name = config.db.database;
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('DB_NAME may only contain letters, digits and underscores');

  const { database: _omit, ...withoutDb } = config.db;
  const conn = await mysql.createConnection(withoutDb);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    console.log(`Database "${name}" is ready on ${config.db.host}.`);
  } finally {
    await conn.end();
  }
}

main().catch((err: unknown) => {
  console.error('Could not create database:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
