import { config } from '../../config/env';
import { logger } from '../../lib/logger';

/**
 * Sends dashboard login codes.
 *
 *  brevo    Brevo's HTTPS email API (Render's free plan blocks SMTP ports).
 *  console  Development/test only: the code is printed to the server log. Refused in
 *           production by config validation.
 */
export interface Mailer {
  sendLoginCode(to: string, code: string, minutesValid: number): Promise<void>;
}

const subject = 'Your Journal dashboard sign-in code';
const text = (code: string, minutes: number) =>
  `Your sign-in code is ${code}\n\nIt expires in ${minutes} minutes. If you didn't try to sign in, you can ignore this email.`;

const brevoMailer: Mailer = {
  async sendLoginCode(to, code, minutes) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.mail.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: config.mail.fromEmail, name: config.mail.fromName },
        to: [{ email: to }],
        subject,
        textContent: text(code, minutes),
        htmlContent: `<p>Your sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in ${minutes} minutes. If you didn't try to sign in, you can ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
  },
};

const consoleMailer: Mailer = {
  async sendLoginCode(to, code, minutes) {
    if (config.isTest) return;
    // Development only (production refuses MAIL_PROVIDER=console).
    console.log(`[dashboard] login code for ${to}: ${code} (valid ${minutes} min)`);
  },
};

let mailer: Mailer = config.mail.provider === 'brevo' ? brevoMailer : consoleMailer;

export function getMailer(): Mailer {
  return mailer;
}

/** Tests replace the mailer to capture codes. */
export function setMailer(m: Mailer): void {
  mailer = m;
}

export function logMailFailure(err: unknown) {
  logger.error('login_code_email_failed', { errorName: err instanceof Error ? err.name : typeof err });
}
