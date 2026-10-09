import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DashboardActivity, ViewerActivity } from '@journal/shared';
import { api, describeError } from '../api/client';
import { font, radius, space, useTheme } from '../lib/theme';
import { Body, Card, Divider, ErrorNote, Muted, SectionTitle } from './ui';

/** "45 min", "1 h 20 min" */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return 'now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return when(iso);
}

function Person({ v }: { v: ViewerActivity }) {
  const { c } = useTheme();
  const [all, setAll] = useState(false);
  const today = new Date().toDateString();
  const todayMinutes = v.visits.filter((x) => new Date(x.startedAt).toDateString() === today).reduce((s, x) => s + x.minutes, 0);
  const online = Date.now() - Date.parse(v.lastSeenAt) < 3 * 60000;
  const shown = all ? v.visits : v.visits.slice(0, 5);
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? c.success : c.border }} />
        <Body style={{ fontWeight: '700', flex: 1 }}>{v.name ?? v.email}</Body>
        {!v.hasAccess && <Muted>No access now</Muted>}
      </View>
      <Muted>{online ? 'Viewing your dashboard now' : `Last seen ${ago(v.lastSeenAt)}`}</Muted>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {[
          ['Today', todayMinutes],
          ['Last 7 days', v.weekMinutes],
        ].map(([label, m]) => (
          <View key={label as string} style={{ flex: 1, backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.sm }}>
            <Text style={{ color: c.muted, fontSize: font.small }}>{label}</Text>
            <Text style={{ color: c.text, fontSize: font.large, fontWeight: '700' }}>{formatMinutes(m as number)}</Text>
          </View>
        ))}
      </View>
      {shown.map((x, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <Text style={{ color: x.signedIn ? c.primary : c.muted, fontSize: font.small, width: 16 }}>{x.signedIn ? '🔑' : '•'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: font.small, fontWeight: '600' }}>
              {when(x.startedAt)} · {formatMinutes(x.minutes)}
            </Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {[x.signedIn ? 'Signed in' : 'Came back', x.device].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      ))}
      {v.visits.length > 5 && (
        <Pressable accessibilityRole="button" onPress={() => setAll((a) => !a)} hitSlop={8}>
          <Text style={{ color: c.primary, fontWeight: '600' }}>{all ? 'Show less' : `Show all ${v.visits.length} visits`}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Profile → Dashboard access: who looked at your dashboard, when, and for how long. */
export function ViewerActivityCard() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['dashboard-activity'],
    queryFn: async () => (await api.get<{ data: DashboardActivity }>('/dashboard-access/activity')).data.data,
    refetchInterval: 60_000,
  });
  return (
    <Card>
      <SectionTitle>Recent activity</SectionTitle>
      <Muted>Sign-ins and time spent on your dashboard over the last 30 days. 🔑 marks a fresh sign-in.</Muted>
      {error ? (
        <ErrorNote message={describeError(error)} />
      ) : isLoading || !data ? (
        <Muted>Loading…</Muted>
      ) : data.viewers.length === 0 ? (
        <Muted style={{ fontStyle: 'italic' }}>No one has opened your dashboard yet.</Muted>
      ) : (
        data.viewers.map((v, i) => (
          <View key={v.email} style={{ gap: space.md }}>
            {i > 0 && <Divider />}
            <Person v={v} />
          </View>
        ))
      )}
    </Card>
  );
}
