import { useSyncExternalStore } from 'react';
import { z } from 'zod';

import { createSecureStorePreference } from '@/lib/hooks/secure-store-preference';
import { PROVIDER_POLICIES_KEY } from '@/lib/storage-keys';

import { listChatBackends, type StoredChatBackend } from './backend-store';
import { isChatProviderId } from './providers';

/**
 * When a provider has more than one account, this says which one answers and how
 * the app moves on from it:
 *
 * - `manual`: the account the user marked active, until they mark another one.
 * - `on-error`: the active account, and the next one after it once a request
 *   failed; the failing key is the one that gets skipped next time.
 * - `round-robin`: a different enabled account for each request, in turn.
 *
 * The choice lives beside the accounts in SecureStore because it names a key's
 * turn, not a cloud setting: switching accounts must never need a round trip.
 */
export const PROVIDER_SWITCH_POLICIES = ['manual', 'on-error', 'round-robin'] as const;

export type ProviderSwitchPolicy = (typeof PROVIDER_SWITCH_POLICIES)[number];

export type ProviderPreference = {
  readonly policy: ProviderSwitchPolicy;
  /** The account `manual` and `on-error` start from. */
  readonly activeAccountId?: string;
};

export type ProviderPreferences = Readonly<Record<string, ProviderPreference>>;

export const DEFAULT_PROVIDER_PREFERENCE: ProviderPreference = Object.freeze({ policy: 'manual' });

const preferenceSchema = z.object({
  policy: z.enum(['manual', 'on-error', 'round-robin']),
  activeAccountId: z.uuid().optional(),
});

const preferencesSchema = z.record(z.string(), preferenceSchema);

const EMPTY_PREFERENCES: ProviderPreferences = Object.freeze({});

const store = createSecureStorePreference<ProviderPreferences>({
  key: PROVIDER_POLICIES_KEY,
  defaultValue: EMPTY_PREFERENCES,
  parse: raw => {
    if (raw === null) {
      return EMPTY_PREFERENCES;
    }
    try {
      const parsed = preferencesSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : EMPTY_PREFERENCES;
    } catch {
      return EMPTY_PREFERENCES;
    }
  },
  serialize: value => JSON.stringify(value),
});
store.preload();

/**
 * The accounts that can answer one model for one provider, in the order the
 * policy tries them: every enabled account of that provider whose model list
 * carries the id. The order starts at the active account for `manual` and
 * `on-error`, and at the next turn for `round-robin`.
 */
export function providerAccountsForModel(
  providerId: string,
  modelId: string,
  accounts: readonly StoredChatBackend[] = listChatBackends()
): StoredChatBackend[] {
  const candidates = accounts.filter(
    account =>
      account.provider === providerId &&
      account.enabled !== false &&
      account.models.some(model => model.id === modelId)
  );
  if (candidates.length <= 1) {
    return candidates;
  }
  const { policy, activeAccountId } = providerPreference(providerId);
  if (policy === 'round-robin') {
    const cursor = roundRobinCursor.get(providerId) ?? 0;
    roundRobinCursor.set(providerId, cursor + 1);
    const start = cursor % candidates.length;
    return [...candidates.slice(start), ...candidates.slice(0, start)];
  }
  const activeIndex = candidates.findIndex(account => account.id === activeAccountId);
  if (activeIndex <= 0) {
    return candidates;
  }
  return [...candidates.slice(activeIndex), ...candidates.slice(0, activeIndex)];
}

/** Rotation state for `round-robin`; it belongs to the session, not the disk. */
const roundRobinCursor = new Map<string, number>();

export function providerPreference(providerId: string): ProviderPreference {
  const stored = isChatProviderId(providerId) ? store.get()[providerId] : undefined;
  return stored ?? DEFAULT_PROVIDER_PREFERENCE;
}

export function setProviderPolicy(providerId: string, policy: ProviderSwitchPolicy): void {
  if (!isChatProviderId(providerId)) {
    return;
  }
  store.set({
    ...store.get(),
    [providerId]: { ...providerPreference(providerId), policy },
  });
}

export function setActiveProviderAccount(providerId: string, accountId: string): void {
  if (!isChatProviderId(providerId)) {
    return;
  }
  store.set({
    ...store.get(),
    [providerId]: { ...providerPreference(providerId), activeAccountId: accountId },
  });
}

/**
 * Moves a provider past the account that just failed, for the `on-error` policy.
 * A `manual` provider stays on its account — that is what manual means — and a
 * `round-robin` one has already moved on by construction.
 */
export function advanceAfterFailure(
  providerId: string,
  modelId: string,
  accounts: readonly StoredChatBackend[] = listChatBackends()
): void {
  const { activeAccountId, policy } = providerPreference(providerId);
  if (policy !== 'on-error') {
    return;
  }
  const candidates = providerAccountsForModel(providerId, modelId, accounts);
  if (candidates.length < 2) {
    return;
  }
  const activeIndex = candidates.findIndex(account => account.id === activeAccountId);
  const next = activeIndex === -1 ? candidates[0] : candidates[(activeIndex + 1) % candidates.length];
  if (next !== undefined && next.id !== activeAccountId) {
    setActiveProviderAccount(providerId, next.id);
  }
}

export function useProviderPreferences(): ProviderPreferences {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
