import { describe, expect, it } from 'vitest';
import { formatEmotions, parseEmotions } from './emotions';

describe('emotion chips', () => {
  it('stores selected chips in list order, plus free text', () => {
    expect(formatEmotions(['Guilt', 'Bored'], '')).toBe('Bored, Guilt');
    expect(formatEmotions(['Sad'], '  missed a call  ')).toBe('Sad, missed a call');
    expect(formatEmotions([], '')).toBeNull();
  });

  it('reads older free-text entries back into chips where possible', () => {
    expect(parseEmotions('Shame, unhappy, guilt, Because of the seeing post i got triggered urges again')).toEqual({
      selected: ['Shame', 'Guilt', 'Unhappy'],
      other: 'Because of the seeing post i got triggered urges again',
    });
    expect(parseEmotions('Bored or tierd')).toEqual({ selected: [], other: 'Bored or tierd' });
    expect(parseEmotions(null)).toEqual({ selected: [], other: '' });
  });

  it('round-trips what the form saves', () => {
    const saved = formatEmotions(['Lonely', 'Stressed'], 'new city')!;
    expect(parseEmotions(saved)).toEqual({ selected: ['Lonely', 'Stressed'], other: 'new city' });
  });

  it('never exceeds the database column length', () => {
    expect(formatEmotions(['Bored'], 'x'.repeat(400))!.length).toBe(255);
  });
});
