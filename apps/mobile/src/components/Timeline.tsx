import Ionicons from '@expo/vector-icons/Ionicons';
import { formatTime12, type BlockColor, type IdentityRecord } from '@journal/shared';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
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
const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const DAY_END = 24 * 60 - 1;

/** What a finger is doing on the timeline (after a long-press, or on a resize grip). */
type Drag =
  | { kind: 'move'; id: string; start: number; end: number; origin: number }
  | { kind: 'resize'; id: string; start: number; end: number; origin: number }
  | { kind: 'create'; from: number; to: number; origin: number };

export function Timeline({
  dayKey,
  items,
  identities,
  nowMinutes,
  onPressEmpty,
  onCreateRange,
  onPressBlock,
  onChangeBlock,
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
  /** Long-press on empty time and drag: a new block for that range. */
  onCreateRange: (start: number, end: number) => void;
  onPressBlock: (id: string) => void;
  /** A block was dragged to a new time or resized. */
  onChangeBlock: (id: string, start: number, end: number) => void;
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

  // ---------------------------------------------------------------- dragging
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const callbacks = useRef({ onChangeBlock, onCreateRange });
  callbacks.current = { onChangeBlock, onCreateRange };

  const update = (dy: number) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = snap((dy / HOUR_HEIGHT) * 60);
    if (d.kind === 'move') {
      const len = d.end - d.start;
      const start = Math.max(0, Math.min(DAY_END - len, d.origin + delta));
      if (start !== d.start) setDragBoth({ ...d, start, end: start + len });
    } else if (d.kind === 'resize') {
      const end = Math.max(d.start + SNAP, Math.min(DAY_END, d.origin + delta));
      if (end !== d.end) setDragBoth({ ...d, end });
    } else {
      const to = Math.max(0, Math.min(DAY_END, d.origin + delta));
      if (to !== d.to) setDragBoth({ ...d, to });
    }
  };

  const finish = (commit: boolean) => {
    const d = dragRef.current;
    setDragBoth(null);
    if (!d || !commit) return;
    if (d.kind === 'create') {
      let from = Math.min(d.from, d.to);
      let to = Math.max(d.from, d.to);
      if (to - from < SNAP) to = Math.min(from + 60, DAY_END);
      from = Math.min(from, to - SNAP);
      callbacks.current.onCreateRange(from, to);
    } else {
      callbacks.current.onChangeBlock(d.id, d.start, d.end);
    }
  };

  /**
   * One responder for the whole timeline. It only claims a touch once a drag has been
   * armed (long-press, or the resize grip), so ordinary swipes keep scrolling the page.
   */
  /** True while the timeline (or a grip) owns the touch for a drag. */
  const tracking = useRef(false);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => !!dragRef.current,
      onMoveShouldSetPanResponderCapture: () => !!dragRef.current && !tracking.current,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        tracking.current = true;
      },
      onPanResponderMove: (_, g) => update(g.dy),
      onPanResponderRelease: () => {
        tracking.current = false;
        finish(true);
      },
      onPanResponderTerminate: () => {
        tracking.current = false;
        finish(false);
      },
    }),
  ).current;

  /** The resize grip claims the touch at once (no long-press needed). */
  const grip = (id: string, start: number, end: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        tracking.current = true;
        setDragBoth({ kind: 'resize', id, start, end, origin: end });
      },
      onPanResponderMove: (_, g) => update(g.dy),
      onPanResponderRelease: () => {
        tracking.current = false;
        finish(true);
      },
      onPanResponderTerminate: () => {
        tracking.current = false;
        finish(false);
      },
    }).panHandlers;

  // Lifting the finger after a long-press without dragging: a new block gets the default
  // length; a block stays where it was. (When a drag took over the touch, the press ends
  // too, but then `tracking` is set and the drag carries on.)
  const endIfStill = () => {
    const d = dragRef.current;
    if (!d || tracking.current) return;
    if (d.kind === 'create') finish(true);
    else if (d.kind === 'move' && d.start === d.origin) setDragBoth(null);
  };

  const top = (m: number) => (m / 60) * HOUR_HEIGHT;
  const fmt = (m: number) => formatTime12(timeOf(m));

  return (
    <ScrollView ref={scroller} style={{ height: VIEWPORT }} contentOffset={{ x: 0, y: offset }} nestedScrollEnabled scrollEnabled={!drag}>
      <View onLayout={onLayout} style={{ height: 24 * HOUR_HEIGHT, position: 'relative' }} {...pan.panHandlers}>
        {/* Hour rows: tap an empty half hour to add a block there, or long-press and drag to size it. */}
        {Array.from({ length: 24 }, (_, h) => (
          <View key={h} style={{ position: 'absolute', top: h * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT, flexDirection: 'row' }}>
            <Text style={{ width: GUTTER, color: c.muted, fontSize: 11, marginTop: -7 }}>{h === 0 ? '' : hourLabel(h)}</Text>
            <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: c.border }}>
              {[0, 30].map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityLabel={`Add a block at ${formatTime12(timeOf(h * 60 + m))}`}
                  accessibilityHint="Long-press and drag down to choose how long"
                  onPress={() => onPressEmpty(h * 60 + m)}
                  onLongPress={() => setDragBoth({ kind: 'create', from: h * 60 + m, to: h * 60 + m + 30, origin: h * 60 + m + 30 })}
                  onPressOut={endIfStill}
                  delayLongPress={300}
                  style={({ pressed }) => ({ height: HOUR_HEIGHT / 2, backgroundColor: pressed ? c.primarySoft : 'transparent' })}
                />
              ))}
            </View>
          </View>
        ))}

        {lane > 0 &&
          items.map(({ item, column, columns }) => {
            const dragging = drag && drag.kind !== 'create' && drag.id === item.id ? drag : null;
            const start = dragging ? dragging.start : item.start;
            const end = dragging ? dragging.end : item.end;
            const height = Math.max(22, ((end - start) / 60) * HOUR_HEIGHT - 2);
            // A dragged block spans the full width so it's easy to see where it lands.
            const w = dragging ? lane : lane / columns;
            const left = GUTTER + (dragging ? 0 : column * w);
            const compact = height < 40;
            if (item.kind === 'block') {
              const b = item.block;
              const col = blockColors(b.color, dark);
              const who = b.identityId ? identities.get(b.identityId) : undefined;
              return (
                <View
                  key={`b${item.id}`}
                  style={{
                    position: 'absolute',
                    top: top(start),
                    left,
                    width: w - 3,
                    height,
                    zIndex: dragging ? 10 : 1,
                    elevation: dragging ? 8 : 0,
                    shadowColor: '#000',
                    shadowOpacity: dragging ? 0.25 : 0,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${b.title}, ${formatTime12(b.startTime.slice(0, 5))} to ${formatTime12(b.endTime.slice(0, 5))}`}
                    accessibilityHint="Opens the block. Long-press and drag to move it."
                    onPress={() => onPressBlock(item.id)}
                    onLongPress={() => setDragBoth({ kind: 'move', id: item.id, start: item.start, end: item.end, origin: item.start })}
                    onPressOut={endIfStill}
                    delayLongPress={300}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: col.bg,
                      borderLeftWidth: 4,
                      borderLeftColor: col.accent,
                      borderRadius: radius.sm,
                      paddingHorizontal: space.sm,
                      paddingVertical: compact ? 1 : space.xs,
                      opacity: pressed && !dragging ? 0.75 : 1,
                      overflow: 'hidden',
                    })}
                  >
                    <Text numberOfLines={compact ? 1 : 2} style={{ color: col.text, fontWeight: '700', fontSize: font.small }}>
                      {b.title}
                      {compact && <Text style={{ fontWeight: '400' }}>  {fmt(start)}</Text>}
                    </Text>
                    {!compact && (
                      <Text numberOfLines={1} style={{ color: col.text, fontSize: 11, opacity: 0.85 }}>
                        {fmt(start)} – {fmt(end)}
                        {who && !dragging ? `  ·  ${identityLabel(who.statement)}` : ''}
                      </Text>
                    )}
                  </Pressable>
                  {/* Resize grip on the bottom edge. */}
                  <View
                    accessible
                    accessibilityLabel={`Resize ${b.title}`}
                    {...grip(item.id, item.start, item.end)}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: -6, height: 18, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: col.accent, opacity: dragging ? 1 : 0.6 }} />
                  </View>
                </View>
              );
            }
            const t = item.task;
            const done = !!t.completedAt;
            return (
              <View
                key={`t${item.id}`}
                style={{
                  position: 'absolute',
                  top: top(start),
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

        {drag?.kind === 'create' && lane > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: top(Math.min(drag.from, drag.to)),
              height: Math.max(16, (Math.abs(drag.to - drag.from) / 60) * HOUR_HEIGHT),
              left: GUTTER,
              width: lane - 3,
              backgroundColor: c.primarySoft,
              borderWidth: 2,
              borderColor: c.primary,
              borderRadius: radius.sm,
              paddingHorizontal: space.sm,
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: font.small }}>
              New block · {fmt(Math.min(drag.from, drag.to))} – {fmt(Math.max(drag.from, drag.to))}
            </Text>
          </View>
        )}

        {nowMinutes !== null && (
          <View pointerEvents="none" style={{ position: 'absolute', top: top(nowMinutes) - 1, left: GUTTER - 6, right: 0, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger }} />
            <View style={{ flex: 1, height: 2, backgroundColor: c.danger }} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
