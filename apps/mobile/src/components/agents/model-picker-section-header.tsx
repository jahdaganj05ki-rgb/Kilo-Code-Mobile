import { Pressable, View } from 'react-native';

import { DirectionalChevronRight } from '@/components/ui/directional-icons';
import { ChevronDown } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { type ModelPickerRow } from '@/lib/model-picker-rows';
import { cn } from '@/lib/utils';

const SURFACE_CLASS = 'flex-row items-center bg-secondary px-4 py-2';
const TITLE_CLASS = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';

/**
 * The header row of a picker section: a foldable provider header, or the plain
 * header of a section that names no provider (recommended, all models).
 */
export function ModelPickerSectionRow({
  count,
  onToggleProvider,
  row,
}: Readonly<{
  /** How many models the section holds; absent for a section that names none. */
  count?: number;
  onToggleProvider: (key: string) => void;
  row: Extract<ModelPickerRow, { type: 'header' | 'provider-header' }>;
}>) {
  if (row.type === 'header') {
    return <ModelPickerSectionHeader title={row.title} />;
  }

  return (
    <ModelPickerProviderHeader
      title={row.title}
      count={count}
      expanded={row.expanded}
      onToggle={() => {
        onToggleProvider(row.key);
      }}
    />
  );
}

/** A picker section that names no provider and cannot fold (recommended, all). */
export function ModelPickerSectionHeader({ title }: Readonly<{ title: string }>) {
  return (
    <View className={SURFACE_CLASS}>
      <Text className={TITLE_CLASS}>{title}</Text>
    </View>
  );
}

/**
 * A provider section's header. The header is the control that folds the section
 * and opens it again, and its `expanded` state is what assistive technology
 * announces for the press. It keeps one line and reaches the touch target
 * through vertical slop, so a foldable section is exactly as tall as a static
 * one and folding never shifts the list's rhythm.
 */
export function ModelPickerProviderHeader({
  count,
  expanded,
  onToggle,
  title,
}: Readonly<{ count?: number; expanded: boolean; onToggle: () => void; title: string }>) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      // The section's own name; the state is what tells a screen reader whether
      // the press opens or closes it.
      accessibilityLabel={count === undefined ? title : `${title} (${count})`}
      accessibilityState={{ expanded }}
      hitSlop={{ top: 9, bottom: 9 }}
      className={cn(SURFACE_CLASS, 'justify-between active:opacity-70')}
    >
      <Text className={TITLE_CLASS}>{title}</Text>
      <View className="flex-row items-center gap-2">
        {/* The section's size, so a folded section still says how much it is
         * hiding and a search can be read at a glance. */}
        {count === undefined ? null : (
          <Text className="text-xs tabular-nums text-muted-foreground">{count}</Text>
        )}
        {/* Down while the section is open, sideways while it is closed: the
         * direction every other disclosure carat in the app uses. */}
        {expanded ? (
          <ChevronDown size={14} color={colors.mutedForeground} />
        ) : (
          <DirectionalChevronRight size={14} color={colors.mutedForeground} />
        )}
      </View>
    </Pressable>
  );
}
