import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { type MobileRouter } from '@kilocode/trpc/mobile';
import { AppState } from 'react-native';

import { preloadedAuthToken } from '@/lib/auth/auth-context';
import { refreshStaleProviderCatalogs } from '@/lib/chat/provider-catalog';
import { queryClient } from '@/lib/query-client';
import { trpcClient } from '@/lib/trpc';

const trpcOptions = createTRPCOptionsProxy<MobileRouter>({ client: trpcClient, queryClient });

// Start the getMe fetch as soon as the stored token is known, instead of after
// the first React render. Same query key as useCurrentUserId — React Query
// dedupes the in-flight fetch when the hook mounts.
//
// 401-before-mount: handleTrpcQueryError no-ops while AuthProvider has not yet
// registered the unauthorized handler. That is acceptable: an errored query has
// no dataUpdatedAt, so the mounted useQuery refetches immediately and the
// error handling then runs exactly as today. Net cost: one extra failed request
// on the already-broken-token path.
/** Registered once for the life of the process. */
let catalogWatching = false;

/**
 * Keeps a provider account's model catalogue current without the user asking.
 *
 * The work is bounded — accounts that are switched off, providers without an
 * account, and a catalogue refreshed in the last half day are all skipped — and
 * it starts after the accounts load, so it never delays the first screen.
 *
 * A launch is not the only moment the app can learn something: a phone keeps an
 * app in memory for days, and the catalogue is most stale exactly then. Returning
 * to the foreground runs the same bounded check, which costs a comparison unless
 * the snapshot really is old enough to ask again.
 */
async function refreshCatalogsQuietly(): Promise<void> {
  try {
    await refreshStaleProviderCatalogs();
  } catch {
    // A background refresh stays silent; the account screen reports instead.
  }
}

export function watchProviderCatalogs(): void {
  void refreshCatalogsQuietly();
  if (catalogWatching) {
    return;
  }
  catalogWatching = true;
  AppState.addEventListener('change', state => {
    if (state === 'active') {
      void refreshCatalogsQuietly();
    }
  });
}

export function prefetchCurrentUser(): void {
  void (async () => {
    try {
      const token = await preloadedAuthToken;
      if (token != null) {
        await queryClient.query(trpcOptions.user.getMe.queryOptions()).catch(() => undefined);
      }
    } catch {
      // A rejected preload (keychain unavailable at process start) must not
      // escape as an unhandled rejection. Skipping the prefetch costs nothing:
      // AuthProvider's bootstrap read owns the restore, and the mounted
      // useCurrentUserId fetches once a token is published.
    }
  })();
}
