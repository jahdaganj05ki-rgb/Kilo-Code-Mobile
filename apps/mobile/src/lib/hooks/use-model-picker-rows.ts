import { useCallback, useMemo, useState } from 'react';

import { type SessionModelOption } from '@/lib/hooks/use-session-model-options';
import { buildModelPickerRows, type ModelPickerRow } from '@/lib/model-picker-rows';

type ModelPickerRows = {
  rows: ModelPickerRow[];
  /** Folds the provider section under `key` shut, or opens it again. */
  toggleProvider: (key: string) => void;
  /** Opens every section; the sheet calls it when it gains focus. */
  resetCollapsedProviders: () => void;
};

/**
 * The picker's rows and the provider sections the user folded shut. The sheet
 * opens with every section listed, so this state resets with the search field
 * whenever the sheet gains focus rather than persisting across opens.
 */
export function useModelPickerRows({
  favoriteIds,
  models,
  search,
}: {
  favoriteIds: Set<string>;
  models: SessionModelOption[] | undefined;
  search: string;
}): ModelPickerRows {
  const [collapsedProviders, setCollapsedProviders] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );

  const rows = useMemo(
    () =>
      buildModelPickerRows({
        models: models ?? [],
        search,
        favoriteIds,
        collapsedProviders,
      }),
    [collapsedProviders, favoriteIds, models, search]
  );

  // Folding a section is neither a commit nor a selection: it changes no state
  // the app keeps, so it takes no haptic.
  const toggleProvider = useCallback((key: string) => {
    setCollapsedProviders(current => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const resetCollapsedProviders = useCallback(() => {
    setCollapsedProviders(new Set<string>());
  }, []);

  return { resetCollapsedProviders, rows, toggleProvider };
}
