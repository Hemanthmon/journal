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

  // Read-only web dashboard. A viewer logs in with an emailed one-time code and sees the
  // owner's records. Owners share access from the app; DASHBOARD_VIEWER_EMAIL additionally
  // grants one viewer from the server. Leave the session secret empty to disable it.
  DASHBOARD_VIEWER_EMAIL: z.string().trim().toLowerCase().default(''),
  DASHBOARD_OWNER_EMAIL: z.string().trim().toLowerCase().default(''),
  DASHBOARD_SESSION_SECRET: z.string().default(''),
  DASHBOARD_SESSION_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  // How login codes are delivered: 'brevo' (HTTPS email API; SMTP is blocked on Render's
  // free plan) or 'console' (development/test only: printed to the server log).
  MAIL_PROVIDER: z.enum(['brevo', 'console']).default('console'),
  BREVO_API_KEY: z.string().default(''),
  MAIL_FROM_EMAIL: z.string().default(''),
  MAIL_FROM_NAME: z.string().default('Journal'),

  // Google Calendar two-way sync (optional). Create an OAuth client (type "Web application")
  // in Google Cloud with redirect URI <PUBLIC_URL>/api/google/callback.
  GOOGLE_CLIENT_ID: z.string().trim().default(''),
  GOOGLE_CLIENT_SECRET: z.string().trim().default(''),
  // Encrypts stored Google refresh tokens: 32+ random characters.
  GOOGLE_TOKEN_KEY: z.string().default(''),
  // Public https address of this server, e.g. https://journal-api-sv60.onrender.com
  // (defaults to the address the request came in on).
  PUBLIC_URL: z.string().trim().default(''),
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

// DASHBOARD_OWNER_EMAIL is optional: when empty, the only account in the database is the owner.
const dashboardEnabled = !!env.DASHBOARD_SESSION_SECRET || !!env.DASHBOARD_VIEWER_EMAIL;
if (dashboardEnabled) {
  if (env.DASHBOARD_SESSION_SECRET.length < 32) {
    throw new Error('DASHBOARD_SESSION_SECRET must be at least 32 characters when the dashboard is enabled');
  }
  if (env.DASHBOARD_SESSION_SECRET === env.JWT_ACCESS_SECRET) {
    throw new Error('DASHBOARD_SESSION_SECRET must differ from JWT_ACCESS_SECRET');
  }
  if (env.NODE_ENV === 'production' && env.MAIL_PROVIDER === 'console') {
    throw new Error('MAIL_PROVIDER=console is not allowed in production (login codes would be logged)');
  }
  if (env.MAIL_PROVIDER === 'brevo' && (!env.BREVO_API_KEY || !env.MAIL_FROM_EMAIL)) {
    throw new Error('MAIL_PROVIDER=brevo needs BREVO_API_KEY and MAIL_FROM_EMAIL');
  }
}

const googleEnabled = !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
if (googleEnabled && env.GOOGLE_TOKEN_KEY.length < 32) {
  throw new Error('GOOGLE_TOKEN_KEY must be at least 32 characters when Google sync is enabled');
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
  dashboard: {
    enabled: dashboardEnabled,
    viewerEmail: env.DASHBOARD_VIEWER_EMAIL,
    ownerEmail: env.DASHBOARD_OWNER_EMAIL,
    sessionSecret: env.DASHBOARD_SESSION_SECRET,
    sessionHours: env.DASHBOARD_SESSION_HOURS,
  },
  google: {
    enabled: googleEnabled,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    tokenKey: env.GOOGLE_TOKEN_KEY,
    publicUrl: env.PUBLIC_URL.replace(/\/$/, ''),
  },
  mail: {
    provider: env.MAIL_PROVIDER,
    brevoApiKey: env.BREVO_API_KEY,
    fromEmail: env.MAIL_FROM_EMAIL,
    fromName: env.MAIL_FROM_NAME,
  },
} as const;

export type AppConfig = typeof config;
