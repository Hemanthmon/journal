import { addDays, weekdayName, weekdayOf } from '@journal/shared';
import { View } from 'react-native';
import type { RepeatChoice } from '../data/series';
import { space } from '../lib/theme';
import { DateField } from './DateTimeFields';
import { Chip, Muted, SectionTitle, Segmented } from './ui';

type Mode = 'none' | 'daily' | 'weekly' | 'custom';

/** Doesn't repeat / Daily / Weekly / Custom days, with an optional end date. */
export function RepeatPicker({ date, value, onChange }: { date: string; value: RepeatChoice | null; onChange: (v: RepeatChoice | null) => void }) {
  const mode: Mode = value ? value.frequency : 'none';
  const day = weekdayOf(date);
  const set = (m: Mode) => {
    if (m === 'none') return onChange(null);
    const days = m === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : m === 'weekly' ? [day] : value?.frequency === 'custom' ? value.days : [day];
    onChange({ frequency: m, days, endDate: value?.endDate ?? null });
  };
  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle>Repeat</SectionTitle>
      <Segmented
        options={[
          { value: 'none', label: 'Once' },
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: `Every ${weekdayName(day)}` },
          { value: 'custom', label: 'Custom' },
        ]}
        value={mode}
        onChange={set}
      />
      {value?.frequency === 'custom' && (
        <>
          <Muted>On these days</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {[1, 2, 3, 4, 5, 6, 7].map((w) => {
              const on = value.days.includes(w);
              return (
                <Chip
                  key={w}
                  label={weekdayName(w)}
                  selected={on}
                  onPress={() => {
                    const days = on ? value.days.filter((x) => x !== w) : [...value.days, w].sort();
                    if (days.length) onChange({ ...value, days });
                  }}
                />
              );
            })}
          </View>
        </>
      )}
      {value && (
        <>
          <Segmented
            options={[
              { value: 'never', label: 'Never ends' },
              { value: 'on', label: 'Ends on a date' },
            ]}
            value={value.endDate ? 'on' : 'never'}
            onChange={(v) => onChange({ ...value, endDate: v === 'on' ? addDays(date, 27) : null })}
          />
          {value.endDate && <DateField label="Last day" value={value.endDate < date ? date : value.endDate} onChange={(d) => onChange({ ...value, endDate: d < date ? date : d })} />}
        </>
      )}
    </View>
  );
}
