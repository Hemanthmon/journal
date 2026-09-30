import type { MeasurementType } from './schemas/habits';

/**
 * Completion percentage for one habit on one day, capped at 100.
 * The recorded value itself is never capped — 45 of 30 minutes is stored as 45.
 *
 *   boolean:              value >= 1 -> 100, otherwise 0
 *   count/duration/qty:   value / target * 100
 */
export function habitProgress(type: MeasurementType, value: number, target: number): number {
  if (type === 'boolean') return value >= 1 ? 100 : 0;
  if (!(target > 0) || !(value > 0)) return 0;
  return Math.min(100, (value / target) * 100);
}

export function isHabitComplete(type: MeasurementType, value: number, target: number): boolean {
  return habitProgress(type, value, target) >= 100;
}
