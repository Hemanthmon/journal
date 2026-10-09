import Ionicons from '@expo/vector-icons/Ionicons';
import { formatTime12, type BlockColor, type IdentityRecord } from '@journal/shared';
import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
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
const px = (minutes: number) => (minutes / 60) * HOUR_HEIGHT;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * What a finger is doing (after a long-press, or on a resize grip). `o*` are the times
 * when the drag began; `start`/`end`/`to` are where it would land now (15-minute steps).
 * The block itself follows the finger pixel by pixel through an Animated value, so
 * dragging stays smooth: React only re-renders when the snapped time changes.
 */
type Drag =
  | { kind: 'move'; id: string; oStart: number; oEnd: number; start: number; end: number }
  | { kind: 'resize'; id: string; oStart: number; oEnd: number; start: number; end: number }
  | { kind: 'create'; from: number; oTo: number; to: number };

/** A resize grip with one stable touch handler for the life of its block. */
function Grip({
  color,
  label,
  onStart,
  onMove,
  onEnd,
}: {
  color: string;
  label: string;
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: (commit: boolean) => void;
}) {
  const cb = useRef({ onStart, onMove, onEnd });
  cb.current = { onStart, onMove, onEnd };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => cb.current.onStart(),
      onPanResponderMove: (_, g) => cb.current.onMove(g.dy),
      onPanResponderRelease: () => cb.current.onEnd(true),
      onPanResponderTerminate: () => cb.current.onEnd(false),
    }),
  ).current;
  return (
    <View
      accessible
      accessibilityLabel={label}
      {...responder.panHandlers}
      hitSlop={{ top: 6, bottom: 10, left: 0, right: 0 }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: -8, height: 22, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: 32, height: 5, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

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
  const offset = Math.max(0, Math.min(px(focus) - HOUR_HEIGHT, 24 * HOUR_HEIGHT - VIEWPORT));
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
  /** Finger offset in pixels (already limited to the day), driving the dragged block. */
  const dy = useRef(new Animated.Value(0)).current;
  /** Where a just-dropped block sits until the saved version arrives (no flicker back). */
  const [settled, setSettled] = useState<{ id: string; start: number; end: number } | null>(null);
  useEffect(() => {
    if (!settled) return;
    const it = items.find((p) => p.item.id === settled.id);
    if (!it || (it.item.start === settled.start && it.item.end === settled.end)) setSettled(null);
    const t = setTimeout(() => setSettled(null), 3000);
    return () => clearTimeout(t);
  }, [items, settled]);

  const callbacks = useRef({ onChangeBlock, onCreateRange });
  callbacks.current = { onChangeBlock, onCreateRange };

  const update = (rawDy: number) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'move') {
      const len = d.oEnd - d.oStart;
      const off = clamp(rawDy, -px(d.oStart), px(DAY_END - len - d.oStart));
      dy.setValue(off);
      const start = clamp(snap(d.oStart + (off / HOUR_HEIGHT) * 60), 0, DAY_END - len);
      if (start !== d.start) setDragBoth({ ...d, start, end: start + len });
    } else if (d.kind === 'resize') {
      const off = clamp(rawDy, px(d.oStart + SNAP - d.oEnd), px(DAY_END - d.oEnd));
      dy.setValue(off);
      const end = clamp(snap(d.oEnd + (off / HOUR_HEIGHT) * 60), d.oStart + SNAP, DAY_END);
      if (end !== d.end) setDragBoth({ ...d, end });
    } else {
      const off = clamp(rawDy, px(d.from + SNAP - d.oTo), px(DAY_END - d.oTo));
      dy.setValue(off);
      const to = clamp(snap(d.oTo + (off / HOUR_HEIGHT) * 60), d.from + SNAP, DAY_END);
      if (to !== d.to) setDragBoth({ ...d, to });
    }
  };

  const finish = (commit: boolean) => {
    const d = dragRef.current;
    setDragBoth(null);
    dy.setValue(0);
    if (!d || !commit) return;
    if (d.kind === 'create') {
      callbacks.current.onCreateRange(d.from, d.to);
    } else if (d.start !== d.oStart || d.end !== d.oEnd) {
      setSettled({ id: d.id, start: d.start, end: d.end });
      callbacks.current.onChangeBlock(d.id, d.start, d.end);
    }
  };

  /** True while the timeline (or a grip) owns the touch for a drag. */
  const tracking = useRef(false);
  /**
   * One responder for the whole timeline. It only claims a touch once a long-press has
   * armed a drag, so ordinary swipes keep scrolling the page.
   */
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

  // Lifting the finger after a long-press without dragging: a new block gets the default
  // length; a block stays where it was. (When a drag took over the touch, the press ends
  // too, but then `tracking` is set and the drag carries on.)
  const endIfStill = () => {
    const d = dragRef.current;
    if (!d || tracking.current) return;
    if (d.kind === 'create') finish(true);
    else if (d.kind === 'move' && d.start === d.oStart) setDragBoth(null);
  };

  const fmt = (m: number) => formatTime12(timeOf(m));

  return (
    <ScrollView ref={scroller} style={{ height: VIEWPORT }} contentOffset={{ x: 0, y: offset }} nestedScrollEnabled scrollEnabled={!drag}>
      <View onLayout={onLayout} style={{ height: 24 * HOUR_HEIGHT, position: 'relative' }} {...pan.panHandlers}>
        {/* Hour rows: tap an empty half hour to add something there, or long-press and drag to size a block. */}
        {Array.from({ length: 24 }, (_, h) => (
          <View key={h} style={{ position: 'absolute', top: h * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT, flexDirection: 'row' }}>
            <Text style={{ width: GUTTER, color: c.muted, fontSize: 11, marginTop: -7 }}>{h === 0 ? '' : hourLabel(h)}</Text>
            <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: c.border }}>
              {[0, 30].map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityLabel={`Add at ${formatTime12(timeOf(h * 60 + m))}`}
                  accessibilityHint="Long-press and drag down to choose how long"
                  onPress={() => onPressEmpty(h * 60 + m)}
                  onLongPress={() => {
                    const from = h * 60 + m;
                    setDragBoth({ kind: 'create', from, oTo: from + 30, to: from + 30 });
                  }}
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
            const parked = !dragging && settled?.id === item.id ? settled : null;
            // While dragging, the block is drawn from where it started and moved by `dy`.
            const baseStart = dragging ? dragging.oStart : parked ? parked.start : item.start;
            const baseEnd = dragging ? dragging.oEnd : parked ? parked.end : item.end;
            const baseHeight = Math.max(22, px(baseEnd - baseStart) - 2);
            const labelStart = dragging ? dragging.start : baseStart;
            const labelEnd = dragging ? dragging.end : baseEnd;
            const w = dragging ? lane : lane / columns;
            const left = GUTTER + (dragging ? 0 : column * w);
            const compact = Math.max(22, px(labelEnd - labelStart) - 2) < 40;
            if (item.kind === 'block') {
              const b = item.block;
              const col = blockColors(b.color, dark);
              const who = b.identityId ? identities.get(b.identityId) : undefined;
              return (
                <Animated.View
                  key={`b${item.id}`}
                  style={{
                    position: 'absolute',
                    top: px(baseStart),
                    left,
                    width: w - 3,
                    height: dragging?.kind === 'resize' ? Animated.add(baseHeight, dy) : baseHeight,
                    transform: dragging?.kind === 'move' ? [{ translateY: dy }] : [],
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
                    onLongPress={() => setDragBoth({ kind: 'move', id: item.id, oStart: item.start, oEnd: item.end, start: item.start, end: item.end })}
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
                      {compact && <Text style={{ fontWeight: '400' }}>  {fmt(labelStart)}</Text>}
                    </Text>
                    {!compact && (
                      <Text numberOfLines={1} style={{ color: col.text, fontSize: 11, opacity: 0.85 }}>
                        {fmt(labelStart)} – {fmt(labelEnd)}
                        {who && !dragging ? `  ·  ${identityLabel(who.statement)}` : ''}
                      </Text>
                    )}
                  </Pressable>
                  <Grip
                    color={col.accent}
                    label={`Resize ${b.title}`}
                    onStart={() => {
                      tracking.current = true;
                      dy.setValue(0);
                      setDragBoth({ kind: 'resize', id: item.id, oStart: item.start, oEnd: item.end, start: item.start, end: item.end });
                    }}
                    onMove={update}
                    onEnd={(commit) => {
                      tracking.current = false;
                      finish(commit);
                    }}
                  />
                </Animated.View>
              );
            }
            const t = item.task;
            const done = !!t.completedAt;
            return (
              <View
                key={`t${item.id}`}
                style={{
                  position: 'absolute',
                  top: px(baseStart),
                  left,
                  width: w - 3,
                  height: baseHeight,
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
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: px(drag.from),
              height: Animated.add(px(drag.oTo - drag.from), dy),
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
              New · {fmt(drag.from)} – {fmt(drag.to)}
            </Text>
          </Animated.View>
        )}

        {nowMinutes !== null && (
          <View pointerEvents="none" style={{ position: 'absolute', top: px(nowMinutes) - 1, left: GUTTER - 6, right: 0, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger }} />
            <View style={{ flex: 1, height: 2, backgroundColor: c.danger }} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
