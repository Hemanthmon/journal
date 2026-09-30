// Import this first in CLI scripts: `--test` makes config load .env.test instead of .env.
if (process.argv.includes('--test')) process.env.NODE_ENV = 'test';

export {};
