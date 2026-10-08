import { config } from '../../config/env';
import { logger } from '../../lib/logger';
import { KIND_LABEL, type UrgeNote } from '../urgeSupport/notes';

/**
 * Dashboard emails: sign-in codes and "you've been invited" notes.
 *
 *  brevo    Brevo's HTTPS email API (Render's free plan blocks SMTP ports).
 *  console  Development/test only: the code is printed to the server log. Refused in
 *           production by config validation.
 */

export interface LoginCodeEmail {
  code: string;
  minutesValid: number;
  /** As the owner wrote it when sharing; null for the server-configured viewer. */
  viewerName: string | null;
  ownerName: string;
}

export interface InviteEmail {
  viewerName: string;
  ownerName: string;
  /** Where the dashboard is, e.g. https://journal-api-sv60.onrender.com/ */
  dashboardUrl: string;
}

export interface UrgeNoteEmail {
  name: string;
  note: UrgeNote;
}

export interface Mailer {
  sendLoginCode(to: string, mail: LoginCodeEmail): Promise<void>;
  sendInvite(to: string, mail: InviteEmail): Promise<void>;
  sendUrgeNote(to: string, mail: UrgeNoteEmail): Promise<void>;
}

interface Message {
  subject: string;
  /** Shown next to the subject in most inboxes. */
  preheader: string;
  fromName: string;
  text: string;
  html: string;
}

// ------------------------------------------------------------------ templates

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name.trim();

const palette = {
  page: '#eef4ec',
  card: '#fbfdf8',
  forest: '#1f4d36',
  leaf: '#2f7a4d',
  moss: '#5f8a63',
  mint: '#dcebdc',
  ink: '#24352a',
  muted: '#647766',
};

/** One email layout: a soft green page, a leafy header and a warm card. Inline styles only. */
function layout(opts: { preheader: string; ownerName: string; body: string }): string {
  const p = palette;
  const owner = escapeHtml(opts.ownerName);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${owner}'s Journal</title>
</head>
<body style="margin:0;padding:0;background:${p.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${p.page};">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.page}" style="background:${p.page};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td bgcolor="${p.forest}" style="background:${p.forest};background-image:linear-gradient(135deg,${p.forest},${p.leaf});border-radius:20px 20px 0 0;padding:28px 32px;">
      <div style="font-size:28px;line-height:1;">🌿</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#ffffff;margin-top:10px;">${owner}'s Journal</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${p.mint};margin-top:4px;">Small habits, steady growth</div>
    </td></tr>
    <tr><td bgcolor="${p.card}" style="background:${p.card};border-radius:0 0 20px 20px;padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${p.ink};">
      ${opts.body}
    </td></tr>
    <tr><td align="center" style="padding:20px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${p.muted};">
      🌱 Sent because ${owner} shared their journal with this address.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const para = (html: string, extra = '') => `<p style="margin:0 0 16px;${extra}">${html}</p>`;

export function loginCodeMessage(m: LoginCodeEmail): Message {
  const p = palette;
  const owner = firstName(m.ownerName);
  const hi = m.viewerName ? `Hi ${firstName(m.viewerName)},` : 'Hi there,';
  const digits = m.code
    .split('')
    .map(
      (d) =>
        `<td style="padding:0 3px;"><div style="width:40px;height:52px;line-height:52px;text-align:center;background:#ffffff;border:2px solid ${p.mint};border-radius:12px;font-family:'Courier New',Courier,monospace;font-size:26px;font-weight:700;color:${p.forest};">${d}</div></td>`,
    )
    .join('');
  const body = [
    para(escapeHtml(hi), 'font-size:18px;'),
    para(`Here's your code to open ${escapeHtml(owner)}'s journal. Pop it into the sign-in page and you're in.`),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto;"><tr>${digits}</tr></table>`,
    para(
      `It's good for the next <strong>${m.minutesValid} minutes</strong> and works just once.`,
      `text-align:center;color:${p.muted};font-size:14px;`,
    ),
    `<div style="background:${p.mint};border-radius:12px;padding:14px 16px;margin:24px 0 20px;font-size:14px;color:${p.forest};">Didn't ask for this? No worries. You can ignore this email; nobody gets in without the code.</div>`,
    para(`Thanks for being in ${escapeHtml(owner)}'s corner. 💚`, 'margin:0;'),
  ].join('\n');
  return {
    subject: `Your code for ${owner}'s journal 🌿`,
    preheader: `Your sign-in code is inside. It's good for ${m.minutesValid} minutes.`,
    fromName: `${owner}'s Journal`,
    text: `${hi}

Here's your code to open ${owner}'s journal:

    ${m.code}

It's good for the next ${m.minutesValid} minutes and works just once.

Didn't ask for this? No worries. You can ignore this email; nobody gets in without the code.

Thanks for being in ${owner}'s corner.`,
    html: layout({ preheader: `Your sign-in code is inside. It's good for ${m.minutesValid} minutes.`, ownerName: m.ownerName, body }),
  };
}

export function inviteMessage(m: InviteEmail, to: string): Message {
  const p = palette;
  const owner = firstName(m.ownerName);
  const hi = `Hi ${firstName(m.viewerName)},`;
  const url = escapeHtml(m.dashboardUrl);
  const body = [
    para(escapeHtml(hi), 'font-size:18px;'),
    para(
      `${escapeHtml(owner)} has invited you to follow along with their journal: their habits, moods and reflections as they grow. It's read-only, so you can see the progress and cheer them on.`,
    ),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto;"><tr><td bgcolor="${p.leaf}" style="background:${p.leaf};border-radius:999px;">
      <a href="${url}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">Open the dashboard</a>
    </td></tr></table>`,
    para(
      `To sign in, enter <strong>${escapeHtml(to)}</strong> and we'll email you a one-time code. No password needed.`,
      `color:${p.muted};font-size:14px;`,
    ),
    `<div style="border-left:3px solid ${p.moss};padding:4px 0 4px 14px;margin:24px 0 20px;font-family:Georgia,'Times New Roman',serif;font-style:italic;color:${p.forest};">"Every action you take is a vote for the type of person you wish to become."<br><span style="font-style:normal;font-size:13px;color:${p.muted};">— James Clear</span></div>`,
    para(`Growth is easier with someone in your corner. Thank you for being that person. 💚`, 'margin:0;'),
  ].join('\n');
  return {
    subject: `${owner} shared their journal with you 🌿`,
    preheader: `${owner} would love you to follow along.`,
    fromName: `${owner}'s Journal`,
    text: `${hi}

${owner} has invited you to follow along with their journal: their habits, moods and reflections as they grow. It's read-only, so you can see the progress and cheer them on.

Open the dashboard: ${m.dashboardUrl}

To sign in, enter ${to} and we'll email you a one-time code. No password needed.

Growth is easier with someone in your corner. Thank you for being that person.`,
    html: layout({ preheader: `${owner} would love you to follow along.`, ownerName: m.ownerName, body }),
  };
}

/**
 * A calm note for riding out an urge. Softer palette than the other emails (misty
 * teal and sage), lots of space, one idea, one small action. The subject and preview
 * are deliberately neutral because they show on the lock screen.
 */
export function urgeNoteMessage(m: UrgeNoteEmail): Message {
  const p = {
    page: '#eef3f3',
    card: '#fbfdfc',
    deep: '#3f6670',
    sage: '#7fa596',
    mist: '#e3ecea',
    ink: '#2d3b3d',
    muted: '#6a7c7e',
  };
  const n = m.note;
  const hi = `Hi ${firstName(m.name)},`;
  const preheader = 'Take a slow breath. This one is for right now.';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(n.title)}</title>
</head>
<body style="margin:0;padding:0;background:${p.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${p.page};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.page}" style="background:${p.page};">
<tr><td align="center" style="padding:36px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;">
    <tr><td bgcolor="${p.deep}" style="background:${p.deep};background-image:linear-gradient(160deg,${p.deep},${p.sage});border-radius:24px 24px 0 0;padding:34px 32px 30px;text-align:center;">
      <div style="font-size:30px;line-height:1;">🌊</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${p.mist};margin-top:14px;">${escapeHtml(KIND_LABEL[n.kind])}</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;color:#ffffff;margin-top:8px;">${escapeHtml(n.title)}</div>
    </td></tr>
    <tr><td bgcolor="${p.card}" style="background:${p.card};border-radius:0 0 24px 24px;padding:32px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.75;color:${p.ink};">
      <p style="margin:0 0 18px;">${escapeHtml(hi)}</p>
      ${n.paragraphs.map((t) => `<p style="margin:0 0 18px;">${escapeHtml(t)}</p>`).join('\n      ')}
      <div style="background:${p.mist};border-radius:16px;padding:18px 20px;margin:26px 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${p.deep};">
        <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Right now</div>
        ${escapeHtml(n.action)}
      </div>
      <p style="margin:0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${p.muted};">Breathe in for 4 &middot; out for 6.<br>It always passes. You've got this. 💙</p>
    </td></tr>
    <tr><td align="center" style="padding:20px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${p.muted};">
      Sent by your Journal app because you opened the breathing exercise.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  return {
    subject: `${n.title} 🌊`,
    preheader,
    fromName: 'Journal',
    text: `${hi}

${n.title.toUpperCase()}

${n.paragraphs.join('\n\n')}

Right now: ${n.action}

Breathe in for 4, out for 6. It always passes. You've got this.`,
    html,
  };
}

// ------------------------------------------------------------------ transports

async function sendViaBrevo(to: string, msg: Message): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.mail.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: config.mail.fromEmail, name: msg.fromName },
      to: [{ email: to }],
      subject: msg.subject,
      textContent: msg.text,
      htmlContent: msg.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // Brevo errors look like {"code":"unauthorized","message":"..."}; keep only the code.
    const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
    throw new MailProviderError(res.status, typeof body?.code === 'string' ? body.code : undefined);
  }
}

class MailProviderError extends Error {
  constructor(readonly status: number, readonly providerCode?: string) {
    super(`Email provider responded ${status}`);
    this.name = 'MailProviderError';
  }
}

const brevoMailer: Mailer = {
  sendLoginCode: (to, mail) => sendViaBrevo(to, loginCodeMessage(mail)),
  sendInvite: (to, mail) => sendViaBrevo(to, inviteMessage(mail, to)),
  sendUrgeNote: (to, mail) => sendViaBrevo(to, urgeNoteMessage(mail)),
};

const consoleMailer: Mailer = {
  async sendLoginCode(to, mail) {
    if (config.isTest) return;
    // Development only (production refuses MAIL_PROVIDER=console).
    console.log(`[dashboard] login code for ${to}: ${mail.code} (valid ${mail.minutesValid} min)`);
  },
  async sendInvite(to, mail) {
    if (config.isTest) return;
    console.log(`[dashboard] invite for ${to} from ${mail.ownerName}: ${mail.dashboardUrl}`);
  },
  async sendUrgeNote(to, mail) {
    if (config.isTest) return;
    console.log(`[urge-note] for ${to}: ${mail.note.title}`);
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
  if (err instanceof MailProviderError) {
    logger.error('dashboard_email_failed', { errorName: err.name, status: err.status, providerCode: err.providerCode });
    return;
  }
  logger.error('dashboard_email_failed', { errorName: err instanceof Error ? err.name : typeof err });
}
