import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';
import { toast } from 'sonner-native';

import { ScreenHeader } from '@/components/screen-header';
import { TabScreenScrollView } from '@/components/tab-screen';
import { Button } from '@/components/ui/button';
import { ChoiceRow } from '@/components/ui/choice-row';
import { ConfigureRow } from '@/components/ui/configure-row';
import { Cpu } from '@/components/ui/icons';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import {
  type ChatBackendDraft,
  type StoredChatBackend,
  updateChatBackend,
  useChatBackends,
} from '@/lib/chat/backend-store';
import {
  PROVIDER_SWITCH_POLICIES,
  providerPreference,
  setProviderPolicy,
  useProviderPreferences,
} from '@/lib/chat/provider-policy';
import {
  providerCatalog,
  refreshProviderCatalog,
  useProviderCatalogs,
} from '@/lib/chat/provider-catalog';
import { formatDate, formatList } from '@/lib/format';
import { CHAT_PROVIDER_IDS, chatProvider } from '@/lib/chat/providers';
import { STATE_ACTION_CLASS } from '@/lib/a11y/tap-target';
import { i18n } from '@/i18n';

const POLICY_LABELS = {
  manual: 'profile.providers.policyManual',
  'on-error': 'profile.providers.policyOnError',
  'round-robin': 'profile.providers.policyRoundRobin',
} as const;

/** The last four characters are all a list needs to tell two keys apart. */
function maskedKey(apiKey: string): string {
  const tail = apiKey.slice(-4);
  return tail === '' ? '••••' : `••••${tail}`;
}

/** A stored account is its own draft, minus the identity the store owns. */
function accountDraft(
  backend: StoredChatBackend,
  overrides: Partial<ChatBackendDraft>
): ChatBackendDraft {
  const { id: _id, revision: _revision, ...rest } = backend;
  return { ...rest, ...overrides };
}

/**
 * Provider accounts, one section per provider.
 *
 * An account is one stored chat backend linked to the provider: adding a second
 * one of the same provider gives that provider two keys, and this screen decides
 * how the app moves between them. The rows carry the state a user changes often
 * — on/off — while the account's own screen carries the key and the model list.
 */
export function ProvidersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const backends = useChatBackends();
  useProviderPreferences();
  useProviderCatalogs();
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  /** Pull-to-refresh asks every provider that has an enabled account. */
  const refreshAll = async () => {
    setPullRefreshing(true);
    const listed: string[] = [];
    try {
      for (const providerId of CHAT_PROVIDER_IDS) {
        const usable = backends.filter(
          account =>
            account.provider === providerId && account.enabled !== false && account.apiKey !== ''
        );
        if (usable.length === 0) {
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop -- one provider at a time, the same order the buttons take
          const models = await refreshProviderCatalog(providerId, usable);
          // The count stays attached to its provider's name, so the single
          // message still says which catalogue the number describes.
          listed.push(`${chatProvider(providerId)?.name ?? providerId} (${models.length})`);
        } catch {
          // Reported once below: one provider without an answer is not a total failure.
        }
      }
      if (listed.length === 0) {
        toast.error(t('profile.providers.modelsLoadFailed'));
      } else {
        toast.success(
          t('profile.providers.catalogsRefreshed', {
            providers: formatList(listed, i18n.language),
          })
        );
      }
    } finally {
      setPullRefreshing(false);
    }
  };

  /**
   * The picker offers what the provider lists, so this is the control that makes
   * that statement true. It asks every enabled account of the provider at once
   * and keeps one catalogue for the provider.
   */
  const refreshCatalog = async (providerId: string) => {
    setRefreshing(providerId);
    try {
      const models = await refreshProviderCatalog(providerId, backends);
      toast.success(t('profile.providers.catalogRefreshed', { count: models.length }));
    } catch {
      toast.error(t('profile.providers.modelsLoadFailed'));
    } finally {
      setRefreshing(null);
    }
  };

  const openAccount = (providerId: string, accountId?: string) => {
    router.push({
      pathname: '/(app)/(tabs)/(3_profile)/provider-account',
      params: accountId === undefined ? { provider: providerId } : { provider: providerId, account: accountId },
    } as unknown as Href);
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={t('profile.providers.title')} />
      <TabScreenScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4 pb-10 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => {
              void refreshAll();
            }}
          />
        }
      >
        <Text variant="muted" className="text-xs">
          {t('profile.providers.description')}
        </Text>
        {CHAT_PROVIDER_IDS.map(providerId => {
          const provider = chatProvider(providerId);
          if (provider === undefined) {
            return null;
          }
          const accounts = backends.filter(backend => backend.provider === providerId);
          const { policy, activeAccountId } = providerPreference(providerId);
          const catalog = providerCatalog(providerId);
          return (
            <View key={providerId} className="gap-3">
              <View className="gap-0.5">
                <Text variant="small" className="uppercase tracking-wide text-muted-foreground">
                  {provider.name}
                </Text>
                <Text variant="muted" className="text-xs">
                  {catalog === undefined
                    ? t('profile.providers.catalogNever')
                    : t('profile.providers.catalogUpdated', {
                        when: formatDate(new Date(catalog.fetchedAt), i18n.language, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      })}
                </Text>
              </View>
              <View className="rounded-lg bg-secondary px-3">
                {accounts.length === 0 ? (
                  <Text variant="muted" className="py-3 text-xs">
                    {t('profile.providers.emptyAccounts')}
                  </Text>
                ) : (
                  accounts.map((account, index) => {
                    const isActive = account.id === activeAccountId;
                    return (
                      <ConfigureRow
                        key={account.id}
                        icon={Cpu}
                        title={account.name}
                        subtitle={[
                          maskedKey(account.apiKey),
                          t('profile.providers.modelCount', { count: account.models.length }),
                          ...(isActive ? [t('profile.providers.activeBadge')] : []),
                        ].join(' · ')}
                        last={index === accounts.length - 1}
                        trailing={
                          <Switch
                            value={account.enabled !== false}
                            accessibilityLabel={t('profile.providers.enabled')}
                            onValueChange={enabled => {
                              updateChatBackend(account.id, accountDraft(account, { enabled }));
                            }}
                          />
                        }
                        onPress={() => {
                          openAccount(providerId, account.id);
                        }}
                      />
                    );
                  })
                )}
              </View>
              <Button
                variant="outline"
                className={STATE_ACTION_CLASS}
                onPress={() => {
                  openAccount(providerId);
                }}
              >
                <Text>{t('profile.providers.addAccount')}</Text>
              </Button>
              <Button
                variant="outline"
                className={STATE_ACTION_CLASS}
                loading={refreshing === providerId}
                disabled={refreshing !== null}
                onPress={() => {
                  void refreshCatalog(providerId);
                }}
              >
                <Text>{t('profile.providers.catalogRefresh')}</Text>
              </Button>
              <View className="gap-1">
                <Text variant="small" className="uppercase tracking-wide text-muted-foreground">
                  {t('profile.providers.switchPolicy')}
                </Text>
                {PROVIDER_SWITCH_POLICIES.map(switchPolicy => (
                  <ChoiceRow
                    key={switchPolicy}
                    // A dynamic key, so it goes through the instance rather
                    // than the hook's literal-typed translate.
                    label={i18n.t(POLICY_LABELS[switchPolicy])}
                    selected={policy === switchPolicy}
                    onPress={() => {
                      setProviderPolicy(providerId, switchPolicy);
                    }}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </TabScreenScrollView>
    </View>
  );
}
