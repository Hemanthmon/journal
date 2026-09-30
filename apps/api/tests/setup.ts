import { afterAll } from 'vitest';
import { closePool } from '../src/db/pool';

afterAll(async () => {
  await closePool();
});
