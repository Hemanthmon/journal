import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View } from 'react-native';
import { Body, Button, Card, Muted, Screen, Segmented, Title } from '../../../components/ui';
import {
  DURATIONS,
  REST_SCALE,
  breathStateAt,
  formatClock,
  totalSeconds,
  type DurationKey,
} from '../../../lib/breathing';
import { api, isNetworkError } from '../../../api/client';
import { font, space, useTheme } from '../../../lib/theme';
import { usePrefs } from '../../../state/prefs';

type Mode = 'intro' | 'running' | 'paused' | 'done';

type NoteState = { status: 'off' | 'sending' | 'limit' | 'offline' | 'failed' } | { status: 'sent'; title: string };

/** Emails one calming note to the user's login address when the exercise is opened. */
function useUrgeNote(): NoteState {
  const enabled = usePrefs((s) => s.urgeNoteEmail);
  const [state, setState] = useState<NoteState>({ status: enabled ? 'sending' : 'off' });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api
      .post<{ data: { sent: boolean; title?: string } }>('/urge-support/note')
      .then((res) => {
        const d = res.data.data;
        if (alive) setState(d.sent && d.title ? { status: 'sent', title: d.title } : { status: 'limit' });
      })
      .catch((e: unknown) => {
        if (alive) setState({ status: isNetworkError(e) ? 'offline' : 'failed' });
      });
    return () => {
      alive = false;
    };
    // Once per visit to this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

function NoteLine({ note, after }: { note: NoteState; after: boolean }) {
  const { c } = useTheme();
  const text =
    note.status === 'sending'
      ? 'Sending a note to your inbox…'
      : note.status === 'sent'
        ? after
          ? `Your note "${note.title}" is in your inbox. Read it now. 💌`
          : 'A note is on its way to your inbox. Read it after you breathe. 💌'
        : note.status === 'offline'
          ? "You're offline, so no note this time. The breathing still works."
          : note.status === 'limit'
            ? "You've had a few notes this hour. The ones in your inbox are still there for you."
            : null;
  if (!text) return null;
  return <Text style={{ color: note.status === 'sent' ? c.success : c.muted, fontWeight: '600' }}>{text}</Text>;
}

const KEEP_AWAKE_TAG = 'breathing';
const CIRCLE = 240;

/** Guided cyclic-sighing exercise (1 or 2 minutes) for riding out an urge. */
export default function Breathe() {
  const { c } = useTheme();
  const [mode, setMode] = useState<Mode>('intro');
  const [durationKey, setDurationKey] = useState<DurationKey>('2');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [endedEarly, setEndedEarly] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const accumulated = useRef(0); // ms completed before the current run segment
  const startedAt = useRef(0);
  const scale = useRef(new Animated.Value(REST_SCALE)).current;
  const note = useUrgeNote();

  const cycles = DURATIONS.find((d) => d.key === durationKey)!.cycles;
  const state = breathStateAt(elapsedMs, cycles);
  const phaseKey = `${state.cycle}:${state.phaseIndex}`;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, []);

  // Clock: recompute elapsed time from wall time so timer drift never accumulates.
  useEffect(() => {
    if (mode !== 'running') return;
    startedAt.current = Date.now();
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    const id = setInterval(() => {
      const total = accumulated.current + (Date.now() - startedAt.current);
      setElapsedMs(total);
      if (breathStateAt(total, cycles).done) setMode('done');
    }, 100);
    return () => {
      clearInterval(id);
      accumulated.current += Date.now() - startedAt.current;
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [mode, cycles]);

  // Animate the circle toward the current phase's size over the time left in that phase.
  useEffect(() => {
    if (mode !== 'running') {
      scale.stopAnimation();
      return;
    }
    AccessibilityInfo.announceForAccessibility(state.phase.label);
    if (reduceMotion) return;
    const nowMs = accumulated.current + (Date.now() - startedAt.current);
    const anim = Animated.timing(scale, {
      toValue: state.phase.scaleTo,
      duration: Math.max(0, state.phaseEndMs - nowMs),
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
    // Re-run on each new phase, and on pause/resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey, mode, reduceMotion]);

  const start = () => {
    accumulated.current = 0;
    setElapsedMs(0);
    setEndedEarly(false);
    scale.setValue(REST_SCALE);
    setMode('running');
  };

  const feelCalmer = () => {
    setEndedEarly(true);
    setMode('done');
  };

  if (mode === 'intro') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Breathe' }} />
        <Title>Let the urge pass</Title>
        <NoteLine note={note} after={false} />
        <Body>
          Urges rise, peak and fade, usually within minutes. Slow breathing calms your body while it passes. You don't
          have to fight it; just breathe, and stop whenever you feel calmer.
        </Body>
        <Card>
          <Body style={{ fontWeight: '600' }}>Each breath</Body>
          <Body>1. Breathe in slowly through your nose.</Body>
          <Body>2. Take a short extra sip of air.</Body>
          <Body>3. Breathe out slowly through your mouth, all the way.</Body>
          <Muted>Follow the circle: it grows as you breathe in and shrinks as you breathe out. You can close your eyes.</Muted>
        </Card>
        <Segmented
          options={DURATIONS.map((d) => ({ value: d.key, label: d.label }))}
          value={durationKey}
          onChange={setDurationKey}
        />
        <Button title={`Start · ${formatClock(totalSeconds(cycles))}`} icon="play" onPress={start} />
        <Muted>
          Why this breath: in a 2023 Stanford study (Balban et al., Cell Reports Medicine), this kind of breathing,
          called cyclic sighing, improved mood and lowered stress more than mindfulness meditation. The long breath out
          is what calms you. It helps many people ride out urges, but it isn't a guarantee. Be kind to yourself either way.
        </Muted>
      </Screen>
    );
  }

  if (mode === 'done') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Breathe' }} />
        <Title>{endedEarly ? "Glad it's easing" : 'Well done'}</Title>
        <NoteLine note={note} after />
        <Body>
          Take a moment to notice how the urge feels now. If it's still there, that's okay; it will keep fading. You can
          breathe again, go for a short walk, or drink some water.
        </Body>
        <Button
          title="Record this urge"
          icon="create-outline"
          onPress={() => router.replace({ pathname: '/urges/[id]', params: { id: 'new', from: 'breathing' } })}
        />
        <Button title="Breathe again" variant="secondary" icon="refresh" onPress={start} />
        <Button title="Done" variant="ghost" onPress={() => router.navigate('/urges')} />
      </Screen>
    );
  }

  const size = CIRCLE * (reduceMotion ? 0.8 : 1);
  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: 'Breathe' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl }}>
        <View
          style={{ width: CIRCLE, height: CIRCLE, alignItems: 'center', justifyContent: 'center' }}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${state.phase.label}, ${state.phase.hint}. ${state.phaseSecondsLeft} seconds.`}
        >
          <Animated.View
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: c.primarySoft,
              borderWidth: 2,
              borderColor: c.primary,
              transform: [{ scale: reduceMotion ? 1 : scale }],
            }}
          />
          <Text style={{ color: c.text, fontSize: 44, fontWeight: '700' }}>{state.phaseSecondsLeft}</Text>
        </View>
        <View style={{ alignItems: 'center', gap: space.xs }}>
          <Text style={{ color: c.text, fontSize: font.hero, fontWeight: '700' }}>{state.phase.label}</Text>
          <Muted style={{ fontSize: font.body }}>{state.phase.hint}</Muted>
        </View>
        <Muted>{mode === 'paused' ? 'Paused' : `${formatClock(state.totalSecondsLeft)} left`}</Muted>
        <View style={{ alignSelf: 'stretch', gap: space.sm }}>
          <Button title="I feel calmer" icon="checkmark" onPress={feelCalmer} />
          {mode === 'running' ? (
            <Button title="Pause" variant="ghost" icon="pause" onPress={() => setMode('paused')} />
          ) : (
            <Button title="Resume" variant="secondary" icon="play" onPress={() => setMode('running')} />
          )}
        </View>
      </View>
    </Screen>
  );
}
