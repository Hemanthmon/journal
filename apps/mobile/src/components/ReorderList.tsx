import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { space } from '../lib/theme';
import { Divider, IconButton } from './ui';

/** List with accessible move-up/move-down buttons (no drag gesture needed). */
export function ReorderList<T extends { id: string }>({
  items,
  label,
  renderItem,
  onPress,
  onReorder,
}: {
  items: T[];
  label: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onPress: (item: T) => void;
  onReorder: (ids: string[]) => void;
}) {
  const move = (index: number, delta: number) => {
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    onReorder(ids);
  };
  return (
    <View>
      {items.map((item, i) => (
        <View key={item.id}>
          {i > 0 && <Divider />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${label(item)}`}
              onPress={() => onPress(item)}
              style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1, minHeight: 44, justifyContent: 'center' })}
            >
              {renderItem(item)}
            </Pressable>
            <IconButton icon="chevron-up" label={`Move ${label(item)} up`} disabled={i === 0} onPress={() => move(i, -1)} />
            <IconButton
              icon="chevron-down"
              label={`Move ${label(item)} down`}
              disabled={i === items.length - 1}
              onPress={() => move(i, 1)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
