import { useSyncExternalStore } from 'react';

import { BUILD_MODE_KEY } from '@/lib/storage-keys';

import { createSecureStorePreference } from '@/lib/hooks/secure-store-preference';

/** Where an APK build runs. `actions` stays the default: the fork's workflow. */
export const BUILD_MODES = ['actions', 'local'] as const;
export type BuildMode = (typeof BUILD_MODES)[number];

/** Anything but a stored `local` reads as GitHub Actions, the safe default. */
function parseBuildMode(raw: string | null): BuildMode {
  return raw === 'local' ? 'local' : 'actions';
}

const store = createSecureStorePreference<BuildMode>({
  key: BUILD_MODE_KEY,
  defaultValue: 'actions',
  parse: parseBuildMode,
  serialize: value => value,
});

export function preloadBuildModePreference(): void {
  store.preload();
}

export function setBuildMode(value: BuildMode) {
  store.set(value);
}

/** The stored build mode for callers with no React tree (the settings registry). */
export function getBuildMode(): BuildMode {
  return store.getRequested();
}

export function useBuildModePreference() {
  const buildMode = useSyncExternalStore(store.subscribe, store.get);
  const hasLoaded = useSyncExternalStore(store.subscribe, store.getHasLoaded);
  return { buildMode, hasLoaded, setBuildMode };
}
