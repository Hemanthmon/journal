import './cli-env'; // must stay first; `--test` migrates the .env.test database
import { config } from '../config/env';
import { migrate } from './migrate';

migrate((msg) => console.log(msg))
  .then(({ applied, skipped }) => {
    console.log(
      `Database "${config.db.database}": ${applied.length} migration(s) applied, ${skipped.length} already up to date.`,
    );
  })
  .catch((err: unknown) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
