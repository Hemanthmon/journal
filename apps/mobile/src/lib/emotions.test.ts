import { describe, expect, it } from 'vitest';
import { DEFAULT_EMOTIONS } from '@journal/shared';
import { formatEmotions, parseEmotions } from './emotions';

const opts = [...DEFAULT_EMOTIONS];

describe('emotion chips', () => {
  it('stores selected chips in list order, plus free text', () => {
    expect(formatEmotions(['Guilt', 'Bored'], '', opts)).toBe('Bored, Guilt');
    expect(formatEmotions(['Sad'], '  missed a call  ', opts)).toBe('Sad, missed a call');
    expect(formatEmotions([], '', opts)).toBeNull();
  });

  it('reads older free-text entries back into chips where possible', () => {
    expect(parseEmotions('Shame, unhappy, guilt, Because of the seeing post i got triggered urges again', opts)).toEqual({
      selected: ['Shame', 'Guilt', 'Unhappy'],
      other: 'Because of the seeing post i got triggered urges again',
    });
    expect(parseEmotions('Bored or tierd', opts)).toEqual({ selected: [], other: 'Bored or tierd' });
    expect(parseEmotions(null, opts)).toEqual({ selected: [], other: '' });
  });

  it('round-trips what the form saves', () => {
    const saved = formatEmotions(['Lonely', 'Stressed'], 'new city', opts)!;
    expect(parseEmotions(saved, opts)).toEqual({ selected: ['Lonely', 'Stressed'], other: 'new city' });
  });

  it('uses the custom list: removed chips fall back to "Other", added ones become chips', () => {
    const custom = ['Bored', 'Homesick'];
    expect(parseEmotions('Bored, Guilt, homesick', custom)).toEqual({ selected: ['Bored', 'Homesick'], other: 'Guilt' });
  });

  it('never exceeds the database column length', () => {
    expect(formatEmotions(['Bored'], 'x'.repeat(400), opts)!.length).toBe(255);
  });
});
