import { describe, expect, it } from 'vitest';
import { urgeNoteMessage, setMailer } from '../src/modules/dashboard/mailer';
import { NOTES, pickNote } from '../src/modules/urgeSupport/notes';
import { MAX_NOTES_PER_HOUR } from '../src/modules/urgeSupport/routes';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

const api = makeApi();
const sent: { to: string; title: string; name: string }[] = [];
setMailer({
  async sendLoginCode() {},
  async sendInvite() {},
  async sendUrgeNote(to, mail) {
    sent.push({ to, title: mail.note.title, name: mail.name });
  },
});

describe('urge notes', () => {
  it("emails the user's login address a different note each time, up to the hourly limit", async () => {
    const email = uniqueEmail();
    const reg = await registerUser(api, { email, name: 'Hemanth Kumar' });
    const auth = bearer(reg.tokens.accessToken);

    const titles: string[] = [];
    for (let i = 0; i < MAX_NOTES_PER_HOUR; i++) {
      const res = await api.post('/api/urge-support/note').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.data.sent).toBe(true);
      titles.push(res.body.data.title);
    }
    expect(new Set(titles).size).toBe(MAX_NOTES_PER_HOUR);
    expect(sent.slice(-MAX_NOTES_PER_HOUR).every((s) => s.to === email && s.name === 'Hemanth Kumar')).toBe(true);

    const over = await api.post('/api/urge-support/note').set(auth);
    expect(over.body.data).toEqual({ sent: false, reason: 'limit' });
  });

  it('requires the app login', async () => {
    expect((await api.post('/api/urge-support/note')).status).toBe(401);
  });

  it('uses every note once before repeating, and never repeats back to back', () => {
    const user = 'b3c1c7a2-1f0e-4a57-9a3b-2c6f1d9e8a10';
    const n = NOTES.length;
    const firstRound = Array.from({ length: n }, (_, i) => pickNote(user, i).index);
    expect(new Set(firstRound).size).toBe(n);
    const twoRounds = Array.from({ length: n * 3 }, (_, i) => pickNote(user, i).index);
    for (let i = 1; i < twoRounds.length; i++) expect(twoRounds[i]).not.toBe(twoRounds[i - 1]);
    // Different users get different orders.
    expect(pickNote('another-user', 0).index === firstRound[0] && pickNote('another-user', 1).index === firstRound[1]).toBe(false);
  });

  it('keeps the subject discreet and escapes the name', () => {
    const msg = urgeNoteMessage({ name: '<b>Sam</b>', note: NOTES[0]! });
    expect(msg.subject).not.toMatch(/urge|porn|sex/i);
    expect(msg.preheader).not.toMatch(/urge/i);
    expect(msg.html).toContain('Hi &lt;b&gt;Sam&lt;/b&gt;,');
    expect(msg.text).toContain(NOTES[0]!.action);
  });
});
