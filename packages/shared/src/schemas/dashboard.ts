import { z } from 'zod';
import type { Weekday } from '../schedule';
import { emailSchema } from './auth';
import { dateRangeQuerySchema, idSchema, localDateSchema, localTimeSchema } from './common';
import { BLOCK_COLORS, type BlockColor } from './planner';
import type { MeasurementType } from './habits';
import type { QuestionType } from './questions';

/**
 * Read-only web dashboard: request schemas and response shapes. Every view is computed
 * on the server from the owner's synced records; nothing here is stored.
 */

// ------------------------------------------------------------------ requests

export const requestCodeSchema = z.object({ email: emailSchema }).strict();
export type RequestCodeInput = z.infer<typeof requestCodeSchema>;

export const verifyCodeSchema = z
  .object({
    email: emailSchema,
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  })
  .strict();
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

/** The owner shares their dashboard with someone from the app. */
export const shareDashboardSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter their name').max(100, 'Name is too long'),
    email: emailSchema,
  })
  .strict();
export type ShareDashboardInput = z.infer<typeof shareDashboardSchema>;

/** Someone who can currently see the owner's dashboard. */
export interface DashboardViewer {
  id: string;
  email: string;
  name: string | null;
  /** Granted by DASHBOARD_VIEWER_EMAIL on the server; can't be removed from the app. */
  managedByServer: boolean;
  grantedAt: string;
}

/** Optional inclusive local-date range; a missing bound means "from the first record" / "to today". */
export const dashboardRangeSchema = dateRangeQuerySchema;

// ------------------------------------------------------------------ responses

export interface ResolvedRange {
  from: string;
  to: string;
  /** Number of calendar days in the range, inclusive. */
  days: number;
}

export interface DashboardMe {
  viewerEmail: string;
  /** Signed in to their own dashboard: may add and edit calendar blocks. */
  isOwner: boolean;
  ownerName: string;
  timezone: string;
  /** Today in the owner's time zone. */
  today: string;
  /** Earliest date with any data, used for "All records". */
  firstDate: string;
}

export interface UrgeStats {
  total: number;
  avgIntensity: number | null;
  /** Average over records that have a duration. */
  avgDuration: number | null;
  totalDuration: number;
  /** How many records have a duration. */
  withDuration: number;
  /** Neither watched content nor masturbated (both answered No). */
  diverted: number;
  /** Watched content or masturbated (either answered Yes). */
  notDiverted: number;
  /** No Yes, but at least one of the two questions unanswered. */
  unanswered: number;
  /** diverted / (diverted + notDiverted) × 100; unanswered urges are left out. */
  divertedPercent: number | null;
}

/**
 * Whether an urge was diverted: true = both No, false = either Yes, null = not enough
 * answers to tell.
 */
export function urgeDiverted(u: { masturbated: boolean | null; explicitContent: boolean | null }): boolean | null {
  if (u.masturbated === true || u.explicitContent === true) return false;
  if (u.masturbated === false && u.explicitContent === false) return true;
  return null;
}

export interface UrgeView {
  id: string;
  localDate: string;
  /** "HH:MM" */
  localTime: string;
  weekday: string;
  triggerText: string | null;
  intensity: number;
  durationMinutes: number | null;
  emotionBefore: string | null;
  actionTaken: string | null;
  outcome: string | null;
  masturbated: boolean | null;
  explicitContent: boolean | null;
  /** See `urgeDiverted`. */
  diverted: boolean | null;
  remarks: string | null;
}

export interface HabitDay {
  habitId: string;
  name: string;
  type: MeasurementType;
  value: number;
  target: number;
  unit: string | null;
  progress: number;
  completed: boolean;
}

export interface DaySeriesPoint {
  date: string;
  habitPercent: number | null;
  mood: number | null;
  journal: boolean;
  urges: number;
  urgesDiverted: number;
  urgesNotDiverted: number;
  urgesUnanswered: number;
}

export interface ActivityItem {
  kind: 'urge' | 'journal' | 'habit';
  date: string;
  /** "HH:MM", or null when the entry was made on a different day. */
  time: string | null;
  title: string;
  detail: string | null;
}

export interface DashboardOverview {
  range: ResolvedRange;
  today: {
    date: string;
    scheduled: number;
    completed: number;
    percent: number | null;
    journalAnswered: number;
    journalTotal: number;
    mood: number | null;
  };
  habits: { completedHabitDays: number; scheduledHabitDays: number; routinePercent: number | null };
  journal: { daysWritten: number; days: number };
  mood: { latest: number | null; latestDate: string | null; average: number | null };
  urges: UrgeStats;
  /** Same as `UrgeAnalytics.insights`, for the overview's at-a-glance panel. */
  urgeInsights: string[];
  habitInsights: string[];
  moodInsights: string[];
  /** Completion per habit in the range (habits scheduled at least once), best first. */
  habitBreakdown: { id: string; name: string; completedDays: number; scheduledDays: number; completionPercent: number | null }[];
  /** How many days had each mood (1..5), all five levels included. */
  moodCounts: { value: number; count: number }[];
  series: DaySeriesPoint[];
  recent: ActivityItem[];
}

export interface CompletionGroup {
  completed: number;
  scheduled: number;
  percent: number | null;
}

export interface HabitSummary {
  id: string;
  name: string;
  description: string | null;
  type: MeasurementType;
  target: number;
  unit: string | null;
  scheduleDays: Weekday[];
  status: 'active' | 'paused' | 'archived' | 'deleted';
  scheduledDays: number;
  completedDays: number;
  incompleteDays: number;
  completionPercent: number | null;
  weekly: ({ weekStart: string } & CompletionGroup)[];
  monthly: ({ month: string } & CompletionGroup)[];
}

export interface HabitCalendarDay {
  date: string;
  scheduled: boolean;
  value: number | null;
  target: number | null;
  progress: number | null;
}

export interface HabitDetail extends HabitSummary {
  calendar: HabitCalendarDay[];
}

export interface DaySummary {
  date: string;
  weekday: string;
  habitPercent: number | null;
  habitsCompleted: number;
  habitsScheduled: number;
  mood: number | null;
  answered: number;
  urges: number;
}

export interface DayAnswer {
  questionId: string;
  /** The question as worded when it was answered. */
  question: string;
  type: QuestionType;
  systemKey: string | null;
  textValue: string | null;
  emojiValue: number | null;
  updatedAt: string;
}

export interface DayDetail {
  date: string;
  weekday: string;
  habits: HabitDay[];
  habitPercent: number | null;
  answers: DayAnswer[];
  mood: number | null;
  improveTomorrow: string | null;
  grateful: string | null;
  urges: UrgeView[];
}

export interface LabelCount {
  label: string;
  count: number;
}

/** Diverted / not diverted / unanswered counts for one group of urges. */
export interface OutcomeCounts {
  total: number;
  diverted: number;
  notDiverted: number;
  unanswered: number;
  divertedPercent: number | null;
}

/** Three-hour blocks of the day used by the time-of-day heatmap, in order. */
export const TIME_BLOCKS = [
  '12–3 AM',
  '3–6 AM',
  '6–9 AM',
  '9 AM–12 PM',
  '12–3 PM',
  '3–6 PM',
  '6–9 PM',
  '9 PM–12 AM',
] as const;

export const INTENSITY_BANDS = [
  { key: 'low', label: 'Low (0–3)', min: 0, max: 3 },
  { key: 'medium', label: 'Medium (4–6)', min: 4, max: 6 },
  { key: 'high', label: 'High (7–10)', min: 7, max: 10 },
] as const;

export interface UrgeAnalytics {
  range: ResolvedRange;
  /**
   * Short, neutral sentences summarising the period (rate, trend, peak times, intensity,
   * triggers, runs), most important first.
   */
  insights: string[];
  /** 7-day rolling diverted rate ending on each day; null when that window has no answered urges. */
  rolling: {
    date: string;
    divertedPercent: number | null;
    notDivertedPercent: number | null;
    diverted: number;
    notDiverted: number;
    answered: number;
  }[];
  /** Weekday (1 = Mon) × TIME_BLOCKS index; all 56 cells, including empty ones. */
  timeOfDay: ({ weekday: number; block: number } & OutcomeCounts)[];
  byIntensity: ({ band: (typeof INTENSITY_BANDS)[number]['key']; label: string } & OutcomeCounts)[];
  /** Most common triggers with how often each was diverted. */
  triggerOutcomes: ({ label: string } & OutcomeCounts)[];
  stats: UrgeStats;
  daily: {
    date: string;
    count: number;
    avgIntensity: number | null;
    totalDuration: number;
    diverted: number;
    notDiverted: number;
    unanswered: number;
  }[];
  /** Diverted % per Monday-starting week (weeks with no answered urges have null). */
  weekly: { weekStart: string; diverted: number; notDiverted: number; divertedPercent: number | null }[];
  /** What happened when an urge was not diverted. */
  notDivertedBreakdown: { watchedOnly: number; masturbatedOnly: number; both: number };
  /** Diverted urges in a row, counting back from the most recent answered urge. */
  currentDivertedStreak: number;
  /** Longest run of diverted urges in the range (unanswered urges don't break a run). */
  bestDivertedStreak: number;
  /** Each urge in time order, for the intensity and duration charts. */
  points: { date: string; time: string; intensity: number; durationMinutes: number | null }[];
  triggers: LabelCount[];
  emotions: LabelCount[];
  /** Newest first. */
  records: UrgeView[];
}

// ------------------------------------------------------------------ planner

export interface PlannerIdentity {
  id: string;
  statement: string;
  active: boolean;
  /** Completed tasks linked to this identity: this week, this month, ever. */
  weekVotes: number;
  monthVotes: number;
  totalVotes: number;
}

export interface PlannerTask {
  title: string;
  done: boolean;
  /** "HH:MM" or null */
  time: string | null;
  place: string | null;
  twoMinute: string | null;
  identity: string | null;
}

export interface PlannerGoal {
  text: string;
  done: boolean;
  identity: string | null;
  /** Weekly goal: the monthly focus it serves. */
  focus: string | null;
  /** Monthly focus: its weekly goals. */
  weeklyGoals: { text: string; done: boolean }[];
  tasks: number;
  tasksDone: number;
}

export interface PlannerReview {
  level: 'week' | 'month';
  periodStart: string;
  wentWell: string | null;
  makeEasier: string | null;
  onePercent: string | null;
}

export interface DashboardPlanner {
  today: string;
  week: { start: string; end: string; goals: PlannerGoal[]; tasks: number; tasksDone: number };
  month: { start: string; end: string; focuses: PlannerGoal[]; tasks: number; tasksDone: number };
  days: { date: string; weekday: string; tasks: PlannerTask[] }[];
  identities: PlannerIdentity[];
  /** Yesterday's unfinished tasks (if the selected week is the current one). */
  missedYesterday: string[];
  /** Newest first, at most 8. */
  reviews: PlannerReview[];
}

// ------------------------------------------------------------------ calendar

/** The owner adds or edits a block from the website. */
export const blockInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the block a name').max(200, 'Keep it under 200 characters'),
    localDate: localDateSchema,
    startTime: localTimeSchema,
    endTime: localTimeSchema,
    color: z.enum(BLOCK_COLORS),
    identityId: idSchema.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((b) => b.endTime > b.startTime, { message: 'The block must end after it starts', path: ['endTime'] });
export type BlockInput = z.input<typeof blockInputSchema>;

export interface CalendarBlock {
  id: string;
  title: string;
  date: string;
  /** "HH:MM" */
  start: string;
  end: string;
  color: BlockColor;
  identityId: string | null;
  identity: string | null;
  notes: string | null;
  /** Set when the block is one day of a repeating series (see `series`). */
  seriesId: string | null;
}

export interface CalendarTask {
  id: string;
  title: string;
  date: string;
  /** "HH:MM" */
  time: string;
  done: boolean;
  identity: string | null;
  identityId: string | null;
  twoMinute: string | null;
  seriesId: string | null;
}

/** A repeat rule, for showing and editing occurrences. */
export interface CalendarSeries {
  id: string;
  frequency: 'daily' | 'weekly' | 'custom';
  days: number[];
  endDate: string | null;
}

export interface DashboardCalendar {
  from: string;
  to: string;
  today: string;
  canEdit: boolean;
  blocks: CalendarBlock[];
  /** Planner tasks with a time, shown as task blocks. */
  tasks: CalendarTask[];
  identities: { id: string; statement: string }[];
  series: CalendarSeries[];
  google: { connected: boolean; lastSyncAt: string | null };
}

// ------------------------------------------------------------------ viewer activity

export interface ViewerVisit {
  startedAt: string;
  lastSeenAt: string;
  /** Time on the dashboard in this visit (at least 1). */
  minutes: number;
  /** "Chrome on Windows", or null if unknown. */
  device: string | null;
  /** The visit began with a fresh sign-in (email code). */
  signedIn: boolean;
}

export interface ViewerActivity {
  email: string;
  name: string | null;
  /** Still has access (not removed). */
  hasAccess: boolean;
  lastSeenAt: string;
  /** Minutes over the last 7 days. */
  weekMinutes: number;
  /** Newest first. */
  visits: ViewerVisit[];
}

export interface DashboardActivity {
  viewers: ViewerActivity[];
}

// ------------------------------------------------------------------ highlights

/** Highlight a passage of a journal answer, or a whole urge, with an optional note. */
export const highlightInputSchema = z
  .object({
    kind: z.enum(['answer', 'urge']),
    date: localDateSchema,
    /** answer: the question id; urge: the urge id */
    targetId: idSchema,
    quote: z.string().trim().min(1).max(2000).nullable().optional(),
    start: z.number().int().min(0).nullable().optional(),
    end: z.number().int().min(1).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((h) => h.kind === 'urge' || (h.quote && h.start != null && h.end != null && h.end > h.start), {
    message: 'Select some words to highlight',
    path: ['quote'],
  });
export type HighlightInput = z.input<typeof highlightInputSchema>;

export interface Highlight {
  id: string;
  kind: 'answer' | 'urge';
  date: string;
  targetId: string;
  quote: string | null;
  start: number | null;
  end: number | null;
  note: string | null;
  /** Who made it: the viewer's name (or email), or "You" for the owner's own. */
  author: string;
  authorIsOwner: boolean;
  /** The signed-in person made it (and so may remove it; the owner may remove any). */
  mine: boolean;
  createdAt: string;
}
