import Ionicons from '@expo/vector-icons/Ionicons';
import { formatTime12, type BlockColor, type IdentityRecord } from '@journal/shared';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { timeOf, type PlacedItem } from '../data/blocks';
import { font, radius, space, useTheme } from '../lib/theme';
import { identityLabel } from './planner';

export const HOUR_HEIGHT = 60;
const GUTTER = 52;

/** Soft block colours; light and dark variants keep text readable in every theme. */
export const BLOCK_PALETTE: Record<BlockColor, { light: [string, string, string]; dark: [string, string, string] }> = {
  // [background, accent bar, text]
  sage: { light: ['#E1EEE4', '#6F9F80', '#1F3D2A'], dark: ['#23362B', '#7FB592', '#DDEFE2'] },
  sky: { light: ['#E0ECF7', '#5E8DBA', '#1B3550'], dark: ['#1F3043', '#7EA8D3', '#DCE9F6'] },
  lavender: { light: ['#ECE6F6', '#8C78B8', '#33284D'], dark: ['#2E2840', '#A897D1', '#ECE6F8'] },
  peach: { light: ['#FBE7DC', '#D08A62', '#4D2A17'], dark: ['#41291D', '#E0A27E', '#FBE9DE'] },
  rose: { light: ['#F7E1E6', '#C26E84', '#4A1E2A'], dark: ['#40232B', '#D88EA1', '#F8E3E8'] },
  sand: { light: ['#F3EBD9', '#B39657', '#45381A'], dark: ['#3A3220', '#CDB27A', '#F4EDDC'] },
};

export function blockColors(color: BlockColor, dark: boolean) {
  const [bg, accent, text] = BLOCK_PALETTE[color][dark ? 'dark' : 'light'];
  return { bg, accent, text };
}

const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

/** Visible height of the timeline; it scrolls inside, opening at the time that matters. */
const VIEWPORT = 540;

export function Timeline({
  dayKey,
  items,
  identities,
  nowMinutes,
  onPressEmpty,
  onPressBlock,
  onPressTask,
  onToggleTask,
}: {
  /** Changes when the day changes, so the view re-centres. */
  dayKey: string;
  items: PlacedItem[];
  identities: Map<string, IdentityRecord>;
  /** Minutes since midnight to draw the "now" line at, when showing today. */
  nowMinutes: number | null;
  onPressEmpty: (startMinutes: number) => void;
  onPressBlock: (id: string) => void;
  onPressTask: (id: string) => void;
  onToggleTask: (id: string) => void;
}) {
  const { c, dark } = useTheme();
  const [width, setWidth] = useState(0);
  const lane = Math.max(0, width - GUTTER - 4);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Open at now (today), else the first item, else 8 AM; an hour earlier for context.
  const focus = nowMinutes ?? (items.length ? Math.min(...items.map((p) => p.item.start)) : 8 * 60);
  const offset = Math.max(0, Math.min((focus / 60) * HOUR_HEIGHT - HOUR_HEIGHT, 24 * HOUR_HEIGHT - VIEWPORT));
  const scroller = useRef<ScrollView>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ y: offset, animated: false });
    // Only when the day changes, not after every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  return (
    <ScrollView ref={scroller} style={{ height: VIEWPORT }} contentOffset={{ x: 0, y: offset }} nestedScrollEnabled>
      <View onLayout={onLayout} style={{ height: 24 * HOUR_HEIGHT, position: 'relative' }}>
        {/* Hour rows: tap an empty half hour to add a block there. */}
        {Array.from({ length: 24 }, (_, h) => (
          <View key={h} style={{ position: 'absolute', top: h * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT, flexDirection: 'row' }}>
            <Text style={{ width: GUTTER, color: c.muted, fontSize: 11, marginTop: -7 }}>{h === 0 ? '' : hourLabel(h)}</Text>
            <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: c.border }}>
              {[0, 30].map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityLabel={`Add a block at ${formatTime12(timeOf(h * 60 + m))}`}
                  onPress={() => onPressEmpty(h * 60 + m)}
                  style={({ pressed }) => ({ height: HOUR_HEIGHT / 2, backgroundColor: pressed ? c.primarySoft : 'transparent' })}
                />
              ))}
            </View>
          </View>
        ))}

        {lane > 0 &&
          items.map(({ item, column, columns }) => {
            const top = (item.start / 60) * HOUR_HEIGHT;
            const height = Math.max(22, ((item.end - item.start) / 60) * HOUR_HEIGHT - 2);
            const w = lane / columns;
            const left = GUTTER + column * w;
            const compact = height < 40;
            if (item.kind === 'block') {
              const b = item.block;
              const col = blockColors(b.color, dark);
              const who = b.identityId ? identities.get(b.identityId) : undefined;
              return (
                <Pressable
                  key={`b${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.title}, ${formatTime12(b.startTime.slice(0, 5))} to ${formatTime12(b.endTime.slice(0, 5))}. Edit`}
                  onPress={() => onPressBlock(item.id)}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    top,
                    left,
                    width: w - 3,
                    height,
                    backgroundColor: col.bg,
                    borderLeftWidth: 4,
                    borderLeftColor: col.accent,
                    borderRadius: radius.sm,
                    paddingHorizontal: space.sm,
                    paddingVertical: compact ? 1 : space.xs,
                    opacity: pressed ? 0.75 : 1,
                    overflow: 'hidden',
                  })}
                >
                  <Text numberOfLines={compact ? 1 : 2} style={{ color: col.text, fontWeight: '700', fontSize: font.small }}>
                    {b.title}
                    {compact && <Text style={{ fontWeight: '400' }}>  {formatTime12(b.startTime.slice(0, 5))}</Text>}
                  </Text>
                  {!compact && (
                    <Text numberOfLines={1} style={{ color: col.text, fontSize: 11, opacity: 0.85 }}>
                      {formatTime12(b.startTime.slice(0, 5))} – {formatTime12(b.endTime.slice(0, 5))}
                      {who ? `  ·  ${identityLabel(who.statement)}` : ''}
                    </Text>
                  )}
                </Pressable>
              );
            }
            const t = item.task;
            const done = !!t.completedAt;
            return (
              <View
                key={`t${item.id}`}
                style={{
                  position: 'absolute',
                  top,
                  left,
                  width: w - 3,
                  height,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.xs,
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: done ? c.success : c.primary,
                  borderRadius: radius.sm,
                  paddingHorizontal: space.xs,
                  overflow: 'hidden',
                }}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={t.title}
                  hitSlop={8}
                  onPress={() => onToggleTask(item.id)}
                >
                  <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={done ? c.success : c.primary} />
                </Pressable>
                <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityHint="Edit task" onPress={() => onPressTask(item.id)}>
                  <Text numberOfLines={1} style={{ color: done ? c.muted : c.text, fontSize: font.small, fontWeight: '600', textDecorationLine: done ? 'line-through' : 'none' }}>
                    {t.title}
                  </Text>
                </Pressable>
              </View>
            );
          })}

        {nowMinutes !== null && (
          <View pointerEvents="none" style={{ position: 'absolute', top: (nowMinutes / 60) * HOUR_HEIGHT - 1, left: GUTTER - 6, right: 0, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger }} />
            <View style={{ flex: 1, height: 2, backgroundColor: c.danger }} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
