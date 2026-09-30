import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver, type SaveStatus } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('journal autosave', () => {
  it('debounces typing and saves only the latest text', async () => {
    const saved: string[] = [];
    const statuses: SaveStatus[] = [];
    const a = new Autosaver<string>(async (v) => {
      saved.push(v);
    }, 800);
    a.subscribe((s) => statuses.push(s));

    a.update('H');
    a.update('He');
    a.update('Hello');
    expect(a.getStatus()).toBe('pending');
    await vi.advanceTimersByTimeAsync(799);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(['Hello']);
    expect(a.getStatus()).toBe('saved');
    expect(statuses).toContain('saving');
  });

  it('flushes immediately (e.g. on blur or leaving the screen)', async () => {
    const saved: string[] = [];
    const a = new Autosaver<string>(async (v) => {
      saved.push(v);
    });
    a.update('draft');
    await a.flush();
    expect(saved).toEqual(['draft']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved).toEqual(['draft']);
  });

  it('does not overlap saves and saves edits made during a save', async () => {
    const saved: string[] = [];
    let release!: () => void;
    const a = new Autosaver<string>((v) => {
      saved.push(v);
      return v === 'one' ? new Promise<void>((r) => (release = r)) : Promise.resolve();
    }, 100);
    a.update('one');
    await vi.advanceTimersByTimeAsync(100);
    a.update('two');
    await vi.advanceTimersByTimeAsync(100); // timer fires while 'one' still saving
    expect(saved).toEqual(['one']);
    release();
    await vi.advanceTimersByTimeAsync(0);
    await a.flush();
    expect(saved).toEqual(['one', 'two']);
  });

  it('reports errors and keeps the unsaved text for the next attempt', async () => {
    let fail = true;
    const saved: string[] = [];
    const a = new Autosaver<string>(async (v) => {
      if (fail) throw new Error('disk full');
      saved.push(v);
    });
    a.update('important');
    await a.flush();
    expect(a.getStatus()).toBe('error');
    fail = false;
    await a.flush();
    expect(saved).toEqual(['important']);
    expect(a.getStatus()).toBe('saved');
  });
});
