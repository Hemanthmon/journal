import { describe, expect, it } from 'vitest';
import type { UrgeRecord } from '@journal/shared';
import { withUrgeFreeDays } from './urges';

const u = (localDate: string, localTime = '20:00:00') => ({ id: `${localDate}-${localTime}`, localDate, localTime }) as UrgeRecord;
const show = (items: ReturnType<typeof withUrgeFreeDays>) =>
  items.map((i) => (i.kind === 'urge' ? `urge ${i.urge.localDate}` : `free ${i.from}..${i.to} (${i.days})`));

describe('urge list with urge-free days', () => {
  it('groups urge-free days in a row between urges, newest first', () => {
    const urges = [u('2026-10-12', '21:00:00'), u('2026-10-12', '09:00:00'), u('2026-10-08')];
    expect(show(withUrgeFreeDays(urges, '2026-10-07', '2026-10-13', '2026-10-01'))).toEqual([
      'free 2026-10-13..2026-10-13 (1)',
      'urge 2026-10-12',
      'urge 2026-10-12',
      'free 2026-10-09..2026-10-11 (3)',
      'urge 2026-10-08',
      'free 2026-10-07..2026-10-07 (1)',
    ]);
  });

  it('does not count days before tracking started', () => {
    expect(show(withUrgeFreeDays([u('2026-10-10')], '2026-10-07', '2026-10-12', '2026-10-10'))).toEqual([
      'free 2026-10-11..2026-10-12 (2)',
      'urge 2026-10-10',
    ]);
  });

  it('shows nothing extra when nothing is tracked yet', () => {
    expect(withUrgeFreeDays([], '2026-10-07', '2026-10-13', null)).toEqual([]);
  });

  it('a single day with no urge is one green line', () => {
    expect(show(withUrgeFreeDays([], '2026-10-13', '2026-10-13', '2026-10-01'))).toEqual(['free 2026-10-13..2026-10-13 (1)']);
  });
});
