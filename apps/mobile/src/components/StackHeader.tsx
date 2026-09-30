import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSystemInsets } from '../hooks/useSystemInsets';
import { font, space, useTheme } from '../lib/theme';
import { IconButton } from './ui';

/**
 * Header for the stacks nested inside tabs (Urge Tracker, Profile). The native header in
 * nested stacks can mis-measure the Android status bar in edge-to-edge mode, so this
 * JS header pads itself by the safe-area top inset explicitly.
 */
export function StackHeader({
  title,
  canGoBack,
  onBack,
  right,
}: {
  title: string;
  canGoBack: boolean;
  onBack: () => void;
  right?: ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSystemInsets();
  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingLeft: Math.max(insets.left, canGoBack ? space.xs : space.lg),
        paddingRight: Math.max(insets.right, space.xs),
        backgroundColor: c.bg,
      }}
    >
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        {canGoBack && <IconButton icon="chevron-back" label="Back" onPress={onBack} color={c.text} size={26} />}
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{ flex: 1, color: c.text, fontSize: font.large, fontWeight: '700' }}
        >
          {title}
        </Text>
        {right}
      </View>
    </View>
  );
}
