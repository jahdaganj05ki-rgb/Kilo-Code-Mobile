import { type SessionModelOption } from '@/lib/hooks/use-session-model-options';
import { i18n } from '@/i18n';
import { autoModelLabel } from '@/lib/auto-model-name';

export type ModelPickerRow =
  | { key: string; title: string; type: 'header' }
  | {
      key: string;
      title: string;
      /**
       * A provider section folds down to its own header, so the header is the
       * control that opens and closes it. `expanded` is the state that control
       * reports, and the rows below it exist only while it is true. The
       * Recommended and All-models sections are not a provider and stay open.
       */
      type: 'provider-header';
      expanded: boolean;
    }
  | {
      key: string;
      model: SessionModelOption;
      isFavorite: boolean;
      /**
       * Whether the row still shows the provider line. A provider group's header
       * already names the provider, so its rows drop the line; the FAVORITES,
       * recommended and all-models sections do not name one, and a favorite list
       * spans providers, so their rows keep it.
       */
      showsProvider: boolean;
      type: 'model';
    };

type ModelGroup = {
  key: string;
  title: string;
  namesProvider: boolean;
  models: SessionModelOption[];
};

export type FavoriteToggleAction =
  | { type: 'add'; model: string }
  | { type: 'remove'; models: string[] };

// A CLI-catalog option is one with a CLI `modelRef` that is not a legacy
// Gateway projection. A Gateway or legacy-gateway option is everything else,
// including an option with no `modelRef`.
function isCliCatalogOption(model: SessionModelOption): boolean {
  return Boolean(model.modelRef) && model.overrideSource !== 'legacy-gateway';
}

// The stable write id. Favorites are persisted server-side by this key, so it
// must be stable across sessions and catalog refreshes. CLI catalog options get
// opaque order-based `id`s (`remote-model-N`), so favorite them by their CLI
// model identity instead. Kilo CLI options share the Gateway model id; other
// providers get a `remote:<provider>:<model>` key. Gateway and legacy-gateway
// options keep `id` — the Gateway model id shared with regular Gateway
// favorites.
export function canonicalFavoriteId(model: SessionModelOption): string {
  const modelRef = isCliCatalogOption(model) ? model.modelRef : undefined;
  if (modelRef) {
    return modelRef.providerID === 'kilo'
      ? modelRef.modelID
      : `remote:${modelRef.providerID}:${modelRef.modelID}`;
  }
  return model.id;
}

// Every stored string that marks this option starred. Gateway options accept
// their Gateway id and the historical `remote:kilo:<id>` alias; kilo CLI options
// accept the same pair; other-provider CLI options accept only their
// `remote:<provider>:<model>` key.
export function favoriteKeysForOption(model: SessionModelOption): string[] {
  const modelRef = isCliCatalogOption(model) ? model.modelRef : undefined;
  if (modelRef) {
    if (modelRef.providerID === 'kilo') {
      return [modelRef.modelID, `remote:kilo:${modelRef.modelID}`];
    }
    return [`remote:${modelRef.providerID}:${modelRef.modelID}`];
  }
  return [model.id, `remote:kilo:${model.id}`];
}

export function isFavoriteOption(
  model: SessionModelOption,
  favoriteIds: ReadonlySet<string>
): boolean {
  return favoriteKeysForOption(model).some(key => favoriteIds.has(key));
}

export function favoriteToggleAction(
  option: SessionModelOption,
  storedFavorites: readonly string[]
): FavoriteToggleAction {
  const stored = new Set(storedFavorites);
  const matching = favoriteKeysForOption(option).filter(key => stored.has(key));
  if (matching.length > 0) {
    return { type: 'remove', models: matching };
  }
  return { type: 'add', model: canonicalFavoriteId(option) };
}

const NO_COLLAPSED_PROVIDERS: ReadonlySet<string> = new Set<string>();

export function buildModelPickerRows({
  models,
  search,
  favoriteIds,
  collapsedProviders = NO_COLLAPSED_PROVIDERS,
}: {
  models: SessionModelOption[];
  search: string;
  favoriteIds: Set<string>;
  /** The provider sections the user folded shut, by their `<key>` (`provider:<id>`). */
  collapsedProviders?: ReadonlySet<string>;
}): ModelPickerRow[] {
  const query = search.toLowerCase().trim();
  const filtered = models.filter(model => !query || searchableText(model).includes(query));

  const favorites = filtered.filter(model => isFavoriteOption(model, favoriteIds));
  const rest = filtered.filter(model => !isFavoriteOption(model, favoriteIds));

  const rows: ModelPickerRow[] = [];

  if (favorites.length > 0) {
    rows.push({
      key: 'favorites',
      title: i18n.t('agentChat.modelPicker.favorites'),
      type: 'header',
    });
    for (const model of favorites) {
      rows.push({
        key: `model:${model.id}`,
        model,
        isFavorite: true,
        showsProvider: true,
        type: 'model',
      });
    }
  }

  const groups = new Map<string, ModelGroup>();
  for (const model of rest) {
    const group = groupForModel(model);
    const existing = groups.get(group.key);
    if (existing) {
      existing.models.push(model);
    } else {
      groups.set(group.key, { ...group, models: [model] });
    }
  }

  for (const group of groups.values()) {
    // A search expands every section: a query whose only match sits in a
    // folded section would otherwise answer "No matches" beside a header that
    // holds the match.
    const expanded = query !== '' || !collapsedProviders.has(group.key);
    rows.push(
      group.namesProvider
        ? { key: group.key, title: group.title, type: 'provider-header', expanded }
        : { key: group.key, title: group.title, type: 'header' }
    );
    if (!expanded) {
      continue;
    }
    for (const model of group.models) {
      rows.push({
        key: `model:${model.id}`,
        model,
        isFavorite: false,
        showsProvider: !group.namesProvider,
        type: 'model',
      });
    }
  }

  return rows;
}

function searchableText(model: SessionModelOption): string {
  return [
    model.name,
    // The row renders an auto model's catalog name (`Auto Efficiente` in
    // Italian), so that translated name must be searchable too; matching only
    // the gateway's English spelling answered "No matches" for the name the
    // user could see.
    model.displayId,
    model.provider?.name,
    model.provider?.id,
    autoModelLabel(model.displayId, model.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function groupForModel(
  model: SessionModelOption
): Pick<ModelGroup, 'key' | 'namesProvider' | 'title'> {
  // The curated picks stay one section on top, so a recommended model a
  // provider prefix could claim is still found where the catalogue put it. A
  // CLI catalogue never marks a model preferred, so its provider sections are
  // unaffected by this precedence.
  if (model.isPreferred) {
    return { key: 'recommended', namesProvider: false, title: i18n.t('common.recommended') };
  }
  if (model.provider) {
    return {
      key: `provider:${model.provider.id}`,
      namesProvider: true,
      // Locale-aware: a Turkish provider name uppercases `i` to `İ`.
      title: model.provider.name.toLocaleUpperCase(i18n.language),
    };
  }
  return { key: 'all', namesProvider: false, title: i18n.t('common.allModels') };
}
