import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { selectionHaptic } from '@/lib/haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Info, SearchX } from '@/components/ui/icons';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { type TextInput, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ModelPickerHeader } from '@/components/agents/model-picker-header';
import { ModelPickerSectionRow } from '@/components/agents/model-picker-section-header';
import { ModelPickerOptionRow } from '@/components/agents/model-selector';
import { EmptyState } from '@/components/empty-state';
import { PickerSheet } from '@/components/picker-sheet';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { STATE_ACTION_CLASS } from '@/lib/a11y/tap-target';
import { useModelPickerRows } from '@/lib/hooks/use-model-picker-rows';
import { useModelPreferences } from '@/lib/hooks/use-model-preferences';
import { type SessionModelOption } from '@/lib/hooks/use-session-model-options';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { favoriteToggleAction, type ModelPickerRow } from '@/lib/model-picker-rows';
import { commitModelPickerSelection, resolveModelPickerSelection } from '@/lib/picker-bridge';
import { dismissSearchPickerKeyboard, SEARCHABLE_PICKER_LIST_PROPS } from '@/lib/picker-list';
import { parseParam } from '@/lib/route-params';
import { modelPickerSlot, UNFENCED_ROUTE_KEY, useRouteRegistry } from '@/lib/route-registry';

// The picker sheet renders its own scroll container (`scrollable={false}`), so
// the list fills the sheet's body.
const listStyle = { flex: 1 } satisfies ViewStyle;

export function ModelPickerContent() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { favorites, favoritesError, addFavorite, removeFavorite } = useModelPreferences(undefined);
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);
  const { routeKey: rawRouteKey } = useLocalSearchParams<{ routeKey?: string }>();
  const routeKey = parseParam(rawRouteKey) ?? UNFENCED_ROUTE_KEY;
  useRouteRegistry(routeKey);
  const [search, setSearch] = useState('');
  // The input stays urgent; the list derivation and its rows trail behind so a
  // typing burst on a large catalog does not filter/reconcile on every key.
  const deferredSearch = useDeferredValue(search);
  // The input remains uncontrolled (iOS TextInput rules), so the in-field X
  // clears the native text imperatively and `search` stays the rows' source.
  const searchInputRef = useRef<TextInput>(null);
  const listRef = useRef<FlashListRef<ModelPickerRow>>(null);
  const [bridge, setBridge] = useState(() => modelPickerSlot.get(routeKey));
  const [selectedModel, setSelectedModel] = useState(bridge?.currentValue ?? '');
  const [selectedVariant, setSelectedVariant] = useState(bridge?.currentVariant ?? '');
  const bridgeRef = useRef(bridge);
  const selectedModelRef = useRef(selectedModel);
  const selectedVariantRef = useRef(selectedVariant);
  const selectionChangedRef = useRef(false);
  const closePickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closePicker = useCallback(() => {
    router.back();
  }, [router]);

  // A caller that keeps no variant cannot apply an effort picked here, so the
  // rows leave the chips out and a model tap is the whole selection. Read from
  // the bridge rather than a prop: the slot is the picker route's only input.
  const acceptsVariant = bridge?.acceptsVariant ?? true;
  // The rows and the provider sections folded shut. The sheet itself owns only
  // the search field and the selection.
  // The free chip narrows the picker to models that cost nothing. It is filter
  // state, not preference: the sheet opens unfiltered, like the search field.
  const [freeOnly, setFreeOnly] = useState(false);
  const { providerCounts, resetCollapsedProviders, rows, toggleProvider } = useModelPickerRows({
    favoriteIds,
    models: bridge?.options,
    search: deferredSearch,
    freeOnly,
  });

  useFocusEffect(
    useCallback(() => {
      const nextBridge = modelPickerSlot.get(routeKey);
      const nextModel = nextBridge?.currentValue ?? '';
      const nextVariant = nextBridge?.currentVariant ?? '';

      bridgeRef.current = nextBridge;
      selectedModelRef.current = nextModel;
      selectedVariantRef.current = nextVariant;
      selectionChangedRef.current = false;
      setBridge(nextBridge);
      setSelectedModel(nextModel);
      setSelectedVariant(nextVariant);
      setSearch('');
      setFreeOnly(false);
      resetCollapsedProviders();
      searchInputRef.current?.clear();

      return () => {
        if (closePickerTimerRef.current) {
          clearTimeout(closePickerTimerRef.current);
          closePickerTimerRef.current = null;
        }

        const activeBridge = bridgeRef.current;
        if (activeBridge && selectionChangedRef.current) {
          commitModelPickerSelection(
            activeBridge,
            selectedModelRef.current,
            selectedVariantRef.current
          );
        }
        modelPickerSlot.clear(routeKey);
        bridgeRef.current = undefined;
      };
    }, [resetCollapsedProviders, routeKey])
  );

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [deferredSearch]);

  // Shared by the in-field X and the "No matches" empty state's CTA: drops the
  // query and the input's visible text in one step, so the full list returns
  // without backspacing. The field carries its own control because Android has
  // no native `clearButtonMode` counterpart.
  const handleClearSearch = useCallback(() => {
    searchInputRef.current?.clear();
    setSearch('');
  }, []);

  // The favorite star button in ModelPickerOptionRow already fires its own
  // selection haptic on press — this callback must not fire a second one.
  const handleToggleFavorite = useCallback(
    (option: SessionModelOption) => {
      const action = favoriteToggleAction(option, favorites);
      if (action.type === 'remove') {
        for (const model of action.models) {
          removeFavorite({ model });
        }
      } else {
        addFavorite({ model: action.model });
      }
    },
    [favorites, addFavorite, removeFavorite]
  );

  const handleSelectVariant = useCallback(
    (variant: string) => {
      selectionHaptic();
      dismissSearchPickerKeyboard();
      selectionChangedRef.current = true;
      selectedVariantRef.current = variant;
      setSelectedVariant(variant);

      if (closePickerTimerRef.current) {
        clearTimeout(closePickerTimerRef.current);
      }
      closePickerTimerRef.current = setTimeout(() => {
        closePickerTimerRef.current = null;
        closePicker();
      }, 175);
    },
    [closePicker]
  );

  const handleSelectModel = useCallback(
    (option: SessionModelOption) => {
      if (option.unavailable || !bridge) {
        return;
      }
      selectionHaptic();
      const selection = resolveModelPickerSelection(bridge, option.id, selectedVariantRef.current);
      if (!selection) {
        return;
      }

      // The pick is applied: close the search keyboard with it, so the chosen
      // row's check mark and its thinking-effort chips are visible whether or
      // not the sheet stays open for a variant choice.
      dismissSearchPickerKeyboard();
      selectionChangedRef.current = true;
      selectedModelRef.current = option.id;
      selectedVariantRef.current = selection.variant;
      setSelectedModel(option.id);
      setSelectedVariant(selection.variant);
      if (!acceptsVariant || option.variants.length <= 1) {
        closePicker();
      }
    },
    [acceptsVariant, bridge, closePicker]
  );

  // Hoisted out of the list body: the inline arrow gave the virtualized list a
  // new renderer on every render, which re-rendered every mounted row. Height
  // differs between the group header and a model row, so `getItemType` lets
  // FlashList recycle the two apart.
  const renderItem = useCallback(
    ({ item }: { item: ModelPickerRow | undefined }) => {
      // A stale index past the end of the rows (see `keyExtractor` below).
      if (!item) {
        return null;
      }
      if (item.type === 'header' || item.type === 'provider-header') {
        return (
          <ModelPickerSectionRow
            row={item}
            count={item.type === 'provider-header' ? providerCounts.get(item.key) : undefined}
            onToggleProvider={toggleProvider}
          />
        );
      }

      return (
        <ModelPickerOptionRow
          option={item.model}
          selected={item.model.id === selectedModel}
          selectedVariant={selectedVariant}
          acceptsVariant={acceptsVariant}
          isFavorite={item.isFavorite}
          showProvider={item.showsProvider}
          onSelectModel={handleSelectModel}
          onSelectVariant={handleSelectVariant}
          onToggleFavorite={handleToggleFavorite}
        />
      );
    },
    [
      acceptsVariant,
      handleSelectModel,
      handleSelectVariant,
      handleToggleFavorite,
      selectedModel,
      providerCounts,
      selectedVariant,
      toggleProvider,
    ]
  );

  if (!bridge) {
    return (
      <PickerSheet
        title={t('agentChat.modelPicker.title')}
        onDone={closePicker}
        scrollable={false}
        expired
      />
    );
  }

  // The empty state answers whichever filter emptied the list, and it is
  // written as statements because a chain of ternaries reads as one expression.
  let emptyTitle = t('common.noModelsAvailable');
  let emptyDescription = t('agentChat.modelPicker.noModelsDescription');
  if (deferredSearch.trim()) {
    emptyTitle = t('agentChat.repoPicker.noMatches');
    emptyDescription = t('agents.sessionList.tryDifferentSearch');
  } else if (freeOnly) {
    emptyTitle = t('agentChat.modelPicker.noFreeModels');
    emptyDescription = t('agentChat.modelPicker.noFreeModelsDescription');
  }

  return (
    <PickerSheet
      title={t('agentChat.modelPicker.title')}
      onDone={closePicker}
      scrollable={false}
      headerContent={
        <ModelPickerHeader
          error={favoritesError}
          freeOnly={freeOnly}
          inputRef={searchInputRef}
          search={search}
          onSearch={setSearch}
          onClear={handleClearSearch}
          onToggleFree={() => {
            setFreeOnly(current => !current);
          }}
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={deferredSearch.trim() ? SearchX : Info}
          title={emptyTitle}
          description={emptyDescription}
          action={
            // The in-field X is one way back; the no-matches body offers the
            // same recovery the Agents search empty state does, so the only
            // exit from "No matches" is not backspacing the query away.
            deferredSearch.trim() ? (
              <Button variant="outline" onPress={handleClearSearch} className={STATE_ACTION_CLASS}>
                <Text>{t('common.clearSearch')}</Text>
              </Button>
            ) : undefined
          }
        />
      ) : (
        // No wrapping View: react-native-screens honors the formSheet header
        // only when [header, scroll view] are the content's direct children,
        // so the list itself carries the sheet background.
        //
        // The bottom inset rides on the list's frame, not its content: a content
        // inset only cleared the end of the list, so a row at the viewport bottom
        // (the picker's last row) was drawn under the opaque Android navigation
        // bar. Ending the viewport above the bar is the same frame inset
        // `session-list-screen` uses for its FAB band.
        <FlashList<ModelPickerRow>
          nestedScrollEnabled
          ref={listRef}
          maintainVisibleContentPosition={{ disabled: true }}
          style={[listStyle, { backgroundColor: colors.background, marginBottom: bottom }]}
          data={rows}
          // FlashList stores its props during render. When React discards a
          // deferred search render, FlashList can keep that render's shorter
          // rows and then ask for a row past their end, so the row can be
          // undefined (Sentry KILO-APP-3K0). It indexes `data` without a bounds
          // check for `renderItem` too, which renders nothing for such a row.
          // The key and type fallbacks are the ones FlashList uses when these
          // callbacks are absent.
          keyExtractor={(item: ModelPickerRow | undefined, index) => item?.key ?? String(index)}
          getItemType={(item: ModelPickerRow | undefined) => item?.type}
          {...SEARCHABLE_PICKER_LIST_PROPS}
          renderItem={renderItem}
        />
      )}
    </PickerSheet>
  );
}
