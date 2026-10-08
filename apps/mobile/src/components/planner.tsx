import Ionicons from '@expo/vector-icons/Ionicons';
import { formatShortDate, formatTime12, type IdentityRecord, type PlanTaskRecord } from '@journal/shared';
import { Pressable, Text, View } from 'react-native';
import type { IdentityVotes } from '../data/planner';
import { font, radius, space, useTheme } from '../lib/theme';
import { Body, IconButton, Muted, ProgressBar } from './ui';

/** "I am a reader" → "Reader"-style short label for chips. */
export function identityLabel(statement: string): string {
  const s = statement.trim().replace(/[.!]+$/, '');
  const m = /^i am (?:a |an )?(.+)$/i.exec(s);
  const core = m ? m[1]! : s;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

export function TaskRow({
  task,
  identity,
  onToggle,
  onPress,
}: {
  task: PlanTaskRecord;
  identity?: IdentityRecord;
  onToggle: () => void;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const done = !!task.completedAt;
  const when = [task.localTime ? formatTime12(task.localTime.slice(0, 5)) : null, task.place].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.xs }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={task.title}
        hitSlop={10}
        onPress={onToggle}
        style={{ paddingTop: 2 }}
      >
        <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? c.success : c.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityHint="Edit task" onPress={onPress} style={{ flex: 1, gap: 2 }}>
        <Body style={{ fontWeight: '600', textDecorationLine: done ? 'line-through' : 'none', color: done ? c.muted : c.text }}>
          {task.title}
        </Body>
        {identity && (
          <Text style={{ color: c.success, fontSize: font.small, fontWeight: '600' }}>🪪 {identityLabel(identity.statement)}</Text>
        )}
        {!!when && <Muted>📍 {when}</Muted>}
        {!!task.twoMinute && !done && <Muted>⏱ Start small: {task.twoMinute}</Muted>}
      </Pressable>
    </View>
  );
}

export function VotesList({ votes, empty }: { votes: IdentityVotes[]; empty: string }) {
  const { c } = useTheme();
  if (votes.length === 0) return <Muted>{empty}</Muted>;
  const max = Math.max(1, ...votes.map((v) => v.planned));
  return (
    <View style={{ gap: space.md }}>
      {votes.map((v) => (
        <View key={v.identity.id} style={{ gap: space.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
            <Body style={{ flex: 1 }}>{v.identity.statement}</Body>
            <Text style={{ color: c.success, fontWeight: '700' }}>
              {v.votes} vote{v.votes === 1 ? '' : 's'}
            </Text>
          </View>
          <ProgressBar percent={(v.votes / max) * 100} label={`${v.votes} of ${v.planned} planned`} />
        </View>
      ))}
    </View>
  );
}

export function PeriodNav({ label, onPrev, onNext, onToday }: { label: string; onPrev: () => void; onNext: () => void; onToday?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <IconButton icon="chevron-back" label="Previous" onPress={onPrev} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={onToday ? `${label}. Go to current` : label}
        onPress={onToday}
        disabled={!onToday}
        style={{ flex: 1, alignItems: 'center' }}
      >
        <Text style={{ color: c.text, fontSize: font.body, fontWeight: '700' }}>{label}</Text>
        {onToday && <Text style={{ color: c.primary, fontSize: font.small }}>Back to today</Text>}
      </Pressable>
      <IconButton icon="chevron-forward" label="Next" onPress={onNext} />
    </View>
  );
}

/** A small "done / total" pill. */
export function Tally({ done, total }: { done: number; total: number }) {
  const { c } = useTheme();
  const complete = total > 0 && done === total;
  return (
    <View style={{ backgroundColor: complete ? c.successSoft : c.cardAlt, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
      <Text style={{ color: complete ? c.success : c.muted, fontSize: font.small, fontWeight: '600' }}>
        {done}/{total}
      </Text>
    </View>
  );
}

export const weekLabel = (start: string, end: string) => `${formatShortDate(start)} – ${formatShortDate(end)}`;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026" */
export function monthLabel(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
