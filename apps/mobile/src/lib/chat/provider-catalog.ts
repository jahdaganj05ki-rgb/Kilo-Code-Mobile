import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

import { getItem, setItem } from '@/lib/persist/encrypted-kv';

import {
  type BackendModel,
  listChatBackends,
  type StoredChatBackend,
  waitForChatBackends,
} from './backend-store';
import { fetchProviderModels } from './provider-models';
import { CHAT_PROVIDER_IDS, isChatProviderId } from './providers';

/** Its own scope: a provider's catalogue is device config, not account data. */
const CATALOG_SCOPE = 'provider-catalog';

/**
 * What a provider listed the last time the app asked it.
 *
 * An account keeps the models it was saved with, and a provider retires models
 * — an id that still answers today can be gone next month. This snapshot is the
 * difference: the picker offers what the provider currently lists, and the
 * account screen can name what vanished. It is a cache, not state the user owns,
 * so it lives in the encrypted key-value store rather than beside the accounts.
 */
export type ProviderCatalog = Readonly<{
  fetchedAt: number;
  models: readonly BackendModel[];
}>;

type ProviderCatalogs = Readonly<Record<string, ProviderCatalog>>;

const modelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tools: z.boolean(),
  images: z.boolean(),
  reasoning: z.boolean(),
  contextWindow: z.number().optional(),
  maxOutputTokens: z.number().optional(),
});

const catalogSchema = z.object({ fetchedAt: z.number(), models: z.array(modelSchema) });

const EMPTY: ProviderCatalogs = Object.freeze({});

let catalogs: ProviderCatalogs = EMPTY;
const listeners = new Set<() => void>();

function publish(next: ProviderCatalogs): void {
  catalogs = next;
  for (const listener of listeners) {
    listener();
  }
}

// One read at startup: the picker filters on whatever the last run learned, with
// no network call and nothing on the critical path.
void (async () => {
  const loaded: Record<string, ProviderCatalog> = {};
  await Promise.all(
    CHAT_PROVIDER_IDS.map(async providerId => {
      try {
        const raw = await getItem(CATALOG_SCOPE, providerId);
        if (raw === null) {
          return;
        }
        const parsed = catalogSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          loaded[providerId] = parsed.data;
        }
      } catch {
        // A cache the app cannot read is a cache it never had.
      }
    })
  );
  if (Object.keys(loaded).length > 0) {
    publish(loaded);
  }
})();

export function providerCatalog(providerId: string): ProviderCatalog | undefined {
  return isChatProviderId(providerId) ? catalogs[providerId] : undefined;
}

/** The models the provider listed last, or `undefined` when it was never asked. */
export function providerCatalogModels(providerId: string): readonly BackendModel[] | undefined {
  return providerCatalog(providerId)?.models;
}

export function saveProviderCatalog(
  providerId: string,
  models: readonly BackendModel[]
): void {
  if (!isChatProviderId(providerId) || models.length === 0) {
    return;
  }
  const catalog: ProviderCatalog = { fetchedAt: Date.now(), models };
  publish({ ...catalogs, [providerId]: catalog });
  // `isChatProviderId` narrowed the id above, so the scope/key pair is typed.
  void setItem(CATALOG_SCOPE, providerId, JSON.stringify(catalog)).catch(() => undefined);
}

/**
 * Asks every enabled account of one provider for its catalogue and keeps the
 * union. Two accounts of the same provider normally list the same models; a key
 * the provider refuses is skipped rather than failing the refresh, and only a
 * refresh where no account answered reports a failure.
 */
export async function refreshProviderCatalog(
  providerId: string,
  accounts: readonly StoredChatBackend[] = listChatBackends()
): Promise<BackendModel[]> {
  const usable = accounts.filter(
    account =>
      account.provider === providerId && account.enabled !== false && account.apiKey !== ''
  );
  const byId = new Map<string, BackendModel>();
  for (const account of usable) {
    try {
      // Sequential: a refresh is rare, and one failing key should not race the
      // others into a half-written union.
      // eslint-disable-next-line no-await-in-loop -- one account at a time, above
      const models = await fetchProviderModels({ baseUrl: account.baseUrl, apiKey: account.apiKey });
      for (const model of models) {
        if (!byId.has(model.id)) {
          byId.set(model.id, model);
        }
      }
    } catch {
      // A key that cannot read the catalogue does not invalidate the others.
    }
  }
  const models = [...byId.values()];
  if (models.length === 0) {
    throw new Error('unavailable');
  }
  saveProviderCatalog(providerId, models);
  return models;
}

/** A catalogue older than this is refreshed once at the next launch. */
const CATALOG_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Refreshes the catalogues that went stale, at most once per launch.
 *
 * The picker offers what a provider lists, so a catalogue nobody has refreshed
 * would quietly turn into the saved list again as soon as the provider retires a
 * model. This runs off the startup path — it waits for the accounts to load, asks
 * only providers that have an enabled account, skips a provider refreshed within
 * the last half day, and never reports a failure: the account screen's own
 * refresh is the path that can tell the user what went wrong.
 */
export async function refreshStaleProviderCatalogs(): Promise<void> {
  await waitForChatBackends();
  if (!onlineManager.isOnline()) {
    return;
  }
  const accounts = listChatBackends();
  for (const providerId of CHAT_PROVIDER_IDS) {
    const usable = accounts.filter(
      account =>
        account.provider === providerId && account.enabled !== false && account.apiKey !== ''
    );
    if (usable.length === 0) {
      continue;
    }
    const snapshot = providerCatalog(providerId);
    if (snapshot !== undefined && Date.now() - snapshot.fetchedAt < CATALOG_MAX_AGE_MS) {
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- one provider at a time, so a launch never opens both at once
      await refreshProviderCatalog(providerId, usable);
    } catch {
      // A background refresh stays silent; the account screen reports instead.
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const current = () => catalogs;

/** Re-renders a screen when a catalogue is refreshed. */
export function useProviderCatalogs(): ProviderCatalogs {
  return useSyncExternalStore(subscribe, current, current);
}
