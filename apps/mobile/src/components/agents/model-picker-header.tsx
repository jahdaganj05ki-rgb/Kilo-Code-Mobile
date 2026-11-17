import { type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type TextInput, View } from 'react-native';

import { AlertCircle, Search, X } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

/**
 * The picker's search field and its free chip.
 *
 * It lives beside the sheet content rather than inside it because the content
 * file is already at the lint line budget, and this is the block that grows every
 * time a filter is added.
 */
export function ModelPickerHeader({
  error,
  freeOnly,
  inputRef,
  onClear,
  onSearch,
  onToggleFree,
  search,
}: Readonly<{
  /** A favorites read that failed; the field keeps the row it reports into. */
  error?: string | null;
  freeOnly: boolean;
  inputRef: RefObject<TextInput | null>;
  onClear: () => void;
  onSearch: (value: string) => void;
  onToggleFree: () => void;
  search: string;
}>) {
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <View>
      <View className="flex-row items-center gap-2 rounded-full bg-secondary px-3 py-2 mx-4 mb-3 mt-3">
        <Search size={18} color={colors.mutedForeground} />
        {/* The placeholder is a single-line Text overlay, not the input's own
            placeholder: Android lays the native hint out at the field's width
            with no line cap, so copy wider than a narrow field wraps onto a
            second line. A tail-ellipsized Text truncates the copy at any width
            instead. The shared box draws the value on one line box and centres
            it, and both texts start at the field's left edge so the overlay
            sits exactly where the typed text will. The input also needs the
            physical `pl-0 pr-0`: Android's TextInput ignores the logical
            padding `px-0` compiles to and keeps its default inset. */}
        <View className="relative flex-1">
          <Input
            ref={inputRef}
            accessibilityLabel={t('common.searchModels')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            className="flex-1 px-0 pl-0 pr-0 text-base text-foreground"
            onChangeText={onSearch}
          />
          {search.length === 0 ? (
            <View className="absolute inset-0 justify-center" pointerEvents="none">
              <Text
                accessible={false}
                numberOfLines={1}
                ellipsizeMode="tail"
                className="text-base leading-[normal] font-normal px-0 text-muted-foreground"
              >
                {t('common.searchModels')}
              </Text>
            </View>
          ) : null}
        </View>
        {/* In-field clear, on every platform: `clearButtonMode` is iOS only, so
            Android rendered the query with no way to reset it. */}
        {search.length > 0 ? (
          <Pressable
            onPress={onClear}
            accessibilityLabel={t('common.clearSearch')}
            accessibilityRole="button"
            hitSlop={12}
            className="active:opacity-70"
          >
            <X size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <View className="mx-4 mb-3 flex-row items-center gap-2">
        <Pressable
          onPress={onToggleFree}
          accessibilityRole="button"
          accessibilityLabel={t('models.free')}
          accessibilityState={{ selected: freeOnly }}
          className={cn(
            'rounded-full border px-3 py-1 active:opacity-70',
            freeOnly ? 'border-primary bg-primary/10' : 'border-border'
          )}
        >
          <Text
            className={cn('text-xs font-medium', freeOnly ? 'text-primary' : 'text-muted-foreground')}
          >
            {t('models.free')}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <View className="mx-4 mb-3 flex-row items-center gap-1.5">
          <AlertCircle size={14} color={colors.destructive} />
          <Text className="text-xs text-destructive">{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
