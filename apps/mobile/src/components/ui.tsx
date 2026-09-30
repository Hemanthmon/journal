import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, radius, space, useTheme } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Scrollable, keyboard-aware screen with safe-area padding. */
export function Screen({
  children,
  scroll = true,
  edges = [],
  refreshControl,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const { c } = useTheme();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return (
    <Text accessibilityRole="header" style={[{ color: c.text, fontSize: font.title, fontWeight: '700' }, style]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Text accessibilityRole="header" style={{ color: c.text, fontSize: font.large, fontWeight: '600', flex: 1 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Body({
  children,
  style,
  numberOfLines,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      accessibilityLabel={accessibilityLabel}
      style={[{ color: c.text, fontSize: font.body, lineHeight: 22 }, style]}
    >
      {children}
    </Text>
  );
}

export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { c } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: c.muted, fontSize: font.small, lineHeight: 18 }, style]}>
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const { c } = useTheme();
  const bg = { primary: c.primary, secondary: c.primarySoft, danger: c.dangerSoft, ghost: 'transparent' }[variant];
  const fg = { primary: c.primaryText, secondary: c.primary, danger: c.danger, ghost: c.primary }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={{ color: fg, fontSize: font.body, fontWeight: '600' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  color,
  size = 22,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  size?: number;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={size} color={color ?? c.primary} />
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  multiline,
  style,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ color: c.text, fontSize: font.small, fontWeight: '600' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.cardAlt, borderColor: error ? c.danger : c.border },
          multiline && { minHeight: 110, paddingTop: space.md },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text style={{ color: c.danger, fontSize: font.small }}>{error}</Text>
      ) : hint ? (
        <Muted>{hint}</Muted>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? c.primary : c.cardAlt, borderColor: selected ? c.primary : c.border },
      ]}
    >
      <Text style={{ color: selected ? c.primaryText : c.text, fontSize: font.small, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** One-of-many selector. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrapRow}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Body>{label}</Body>
        {hint && <Muted>{hint}</Muted>}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.primary, false: c.track }}
      />
    </View>
  );
}

/** Tappable settings-style row. */
export function LinkRow({
  icon,
  label,
  detail,
  onPress,
  danger,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={danger ? c.danger : c.primary} />
      <Body style={{ flex: 1, color: danger ? c.danger : c.text }}>{label}</Body>
      {detail && <Muted>{detail}</Muted>}
      <Ionicons name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const { c } = useTheme();
  const p = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
      style={[styles.track, { backgroundColor: c.track }]}
    >
      <View style={[styles.fill, { width: `${p}%`, backgroundColor: p >= 100 ? c.success : c.primary }]} />
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={c.muted} />
      <Body style={{ fontWeight: '600', textAlign: 'center' }}>{title}</Body>
      {message && <Muted style={{ textAlign: 'center' }}>{message}</Muted>}
      {action}
    </View>
  );
}

export function Loading() {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { flex: 1, backgroundColor: c.bg }]}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.note, { backgroundColor: c.dangerSoft }]}>
      <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
      <Text style={{ color: c.danger, flex: 1 }}>{message}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screenContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48, fontSize: font.body },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  empty: { alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl },
  note: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'center' },
});
