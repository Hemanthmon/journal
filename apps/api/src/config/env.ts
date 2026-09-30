import { readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV ?? 'development';
// src/config and dist/config are both two levels below apps/api.
const envFile = path.resolve(__dirname, '../..', nodeEnv === 'test' ? '.env.test' : '.env');
dotenv.config({ path: envFile, quiet: true });

const boolish = z
  .enum(['0', '1', 'true', 'false'])
  .default('0')
  .transform((v) => v === '1' || v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
  // TLS to MySQL. Required for cloud databases (e.g. Aiven). DB_SSL_CA_PATH points to the
  // provider's CA certificate, relative to apps/api or absolute.
  DB_SSL: boolish,
  DB_SSL_CA_PATH: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: boolish,
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Only report variable names and rule messages — never values, which may be secrets.
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration (${envFile}):\n${problems}`);
}
const env = parsed.data;

if (env.NODE_ENV === 'production' && env.BCRYPT_ROUNDS < 12) {
  throw new Error('BCRYPT_ROUNDS must be at least 12 in production');
}

/**
 * TLS options for mysql2. The server certificate is always verified — there is deliberately
 * no option to disable verification, since that would expose the DB password to anyone on
 * the network path.
 */
function loadDbSsl(): { ca?: string; rejectUnauthorized: true } | undefined {
  if (!env.DB_SSL) return undefined;
  if (!env.DB_SSL_CA_PATH) return { rejectUnauthorized: true };
  const caPath = path.resolve(__dirname, '../..', env.DB_SSL_CA_PATH);
  try {
    return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  } catch {
    throw new Error(`DB_SSL_CA_PATH: cannot read CA certificate at ${caPath}`);
  }
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: loadDbSsl(),
  },
  auth: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    bcryptRounds: env.BCRYPT_ROUNDS,
    rateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  },
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: env.TRUST_PROXY,
} as const;

export type AppConfig = typeof config;
