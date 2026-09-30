/**
 * Cyclic sighing ("physiological sigh"): a slow inhale through the nose, a short second
 * inhale to top up the lungs, then a long, slow exhale through the mouth.
 *
 * In a randomized trial (Balban et al., 2023, Cell Reports Medicine) daily, self-paced
 * cyclic sighing improved mood and reduced physiological arousal more than mindfulness
 * meditation. What matters is that the exhale is much longer than the inhales; the
 * study prescribed no exact timings. The pace here (4 s in, 1 s top-up, 7 s out) is a
 * calm, comfortable rhythm. Even a few sighs help, so the user can stop as soon as the
 * urge eases. It's a coping tool for riding out an urge, not a guaranteed cure.
 */

export type PhaseKind = 'inhale' | 'topup' | 'exhale';

export interface Phase {
  kind: PhaseKind;
  label: string;
  hint: string;
  seconds: number;
  /** Circle size at the end of this phase, 0..1. */
  scaleTo: number;
}

export const PHASES: Phase[] = [
  { kind: 'inhale', label: 'Breathe in', hint: 'slowly, through your nose', seconds: 4, scaleTo: 0.85 },
  { kind: 'topup', label: 'A little more', hint: 'a short extra sip of air', seconds: 1, scaleTo: 1 },
  { kind: 'exhale', label: 'Breathe out slowly', hint: 'through your mouth, let it all go', seconds: 7, scaleTo: 0.45 },
];

export const CYCLE_SECONDS = PHASES.reduce((s, p) => s + p.seconds, 0);

/** Session lengths offered. Both are whole breaths and at most 2 minutes. */
export const DURATIONS = [
  { key: '1', label: '1 min', cycles: 5 },
  { key: '2', label: '2 min', cycles: 10 },
] as const;
export type DurationKey = (typeof DURATIONS)[number]['key'];

export const totalSeconds = (cycles: number) => cycles * CYCLE_SECONDS;

/** Circle size before the first breath. */
export const REST_SCALE = 0.45;

export interface BreathState {
  done: boolean;
  /** 1-based breath number (used for timing, not shown to the user). */
  cycle: number;
  phaseIndex: number;
  phase: Phase;
  /** Whole seconds left in the current phase, counting down (e.g. 7, 6, ... 1). */
  phaseSecondsLeft: number;
  /** Whole seconds left in the session. */
  totalSecondsLeft: number;
  /** When the current phase ends, in ms from the start of the session. */
  phaseEndMs: number;
}

/** Where a session of `cycles` breaths is after `elapsedMs` of (unpaused) time. */
export function breathStateAt(elapsedMs: number, cycles: number): BreathState {
  const totalMs = totalSeconds(cycles) * 1000;
  const t = Math.max(0, elapsedMs);
  if (t >= totalMs) {
    const last = PHASES.length - 1;
    return {
      done: true,
      cycle: cycles,
      phaseIndex: last,
      phase: PHASES[last]!,
      phaseSecondsLeft: 0,
      totalSecondsLeft: 0,
      phaseEndMs: totalMs,
    };
  }
  const cycleMs = CYCLE_SECONDS * 1000;
  const cycle = Math.floor(t / cycleMs) + 1;
  let inCycle = t % cycleMs;
  let phaseEndMs = (cycle - 1) * cycleMs;
  let phaseIndex = 0;
  while (inCycle >= PHASES[phaseIndex]!.seconds * 1000) {
    inCycle -= PHASES[phaseIndex]!.seconds * 1000;
    phaseEndMs += PHASES[phaseIndex]!.seconds * 1000;
    phaseIndex++;
  }
  const phase = PHASES[phaseIndex]!;
  phaseEndMs += phase.seconds * 1000;
  return {
    done: false,
    cycle,
    phaseIndex,
    phase,
    phaseSecondsLeft: Math.ceil((phase.seconds * 1000 - inCycle) / 1000),
    totalSecondsLeft: Math.ceil((totalMs - t) / 1000),
    phaseEndMs,
  };
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
