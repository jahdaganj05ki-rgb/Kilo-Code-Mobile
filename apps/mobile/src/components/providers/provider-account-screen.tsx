import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { toast } from 'sonner-native';

import { ScreenHeader } from '@/components/screen-header';
import { TabScreenScrollView } from '@/components/tab-screen';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Text } from '@/components/ui/text';
import { STATE_ACTION_CLASS } from '@/lib/a11y/tap-target';
import {
  addChatBackend,
  type BackendModel,
  deleteChatBackend,
  updateChatBackend,
  useChatBackends,
} from '@/lib/chat/backend-store';
import { providerPreference, setActiveProviderAccount } from '@/lib/chat/provider-policy';
import { chatProvider } from '@/lib/chat/providers';

/** One model id per line; a blank line adds nothing, and a repeat keeps one. */
function parseModelIds(input: string): BackendModel[] {
  const seen = new Set<string>();
  const models: BackendModel[] = [];
  for (const line of input.split('\n')) {
    const id = line.trim();
    if (id === '' || seen.has(id)) {
      continue;
    }
    seen.add(id);
    // A provider's own catalogue makes no statement about tools or images, and
    // guessing either sends a request the endpoint may refuse; the effort picker
    // stays off until a model is known to accept it.
    models.push({ id, name: id, tools: false, images: false, reasoning: false });
  }
  return models;
}

function modelsText(models: readonly BackendModel[]): string {
  return models.map(model => model.id).join('\n');
}

/**
 * One provider account: its label, its key, and the models it offers.
 *
 * The key is never printed back into the field. An existing account keeps the
 * stored key unless a new one is typed, so editing a label or a model list never
 * asks the user to paste the key again.
 */
export function ProviderAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ provider?: string; account?: string }>();
  const backends = useChatBackends();
  const provider = chatProvider(params.provider ?? '');
  const existing =
    params.account === undefined ? undefined : backends.find(one => one.id === params.account);

  const [name, setName] = useState(existing?.name ?? provider?.name ?? '');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? provider?.baseUrl ?? '');
  const [models, setModels] = useState(modelsText(existing?.models ?? []));

  if (provider === undefined) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title={t('profile.providers.title')} />
        <View className="px-4 pt-4">
          <Text variant="muted">{t('common.somethingWentWrong')}</Text>
        </View>
      </View>
    );
  }

  const isActive = providerPreference(provider.id).activeAccountId === existing?.id;

  const save = () => {
    const trimmedName = name.trim();
    if (trimmedName === '') {
      toast.error(t('profile.providers.nameRequired'));
      return;
    }
    const parsed = parseModelIds(models);
    if (parsed.length === 0) {
      toast.error(t('profile.providers.modelsRequired'));
      return;
    }
    // A new account needs a key; an existing one keeps the stored key.
    const key = apiKey.trim();
    if (key === '' && existing === undefined) {
      toast.error(t('profile.providers.apiKeyRequired'));
      return;
    }
    const draft = {
      name: trimmedName,
      baseUrl,
      apiKind: 'chat_completions' as const,
      apiKey: key === '' ? (existing?.apiKey ?? '') : key,
      headers: existing?.headers ?? {},
      models: parsed,
      allowLocalHttp: false,
      provider: provider.id,
      enabled: existing?.enabled ?? true,
    };
    try {
      if (existing === undefined) {
        const created = addChatBackend(draft);
        setActiveProviderAccount(provider.id, created.id);
      } else {
        updateChatBackend(existing.id, draft);
      }
    } catch {
      toast.error(t('modelChat.backends.invalidInput'));
      return;
    }
    toast.success(t('profile.providers.saved'));
    router.back();
  };

  const remove = () => {
    if (existing === undefined) {
      return;
    }
    Alert.alert(
      t('profile.providers.removeTitle'),
      t('profile.providers.removeMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.providers.remove'),
          style: 'destructive',
          onPress: () => {
            deleteChatBackend(existing.id);
            toast.success(t('profile.providers.removed'));
            router.back();
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={
          existing === undefined
            ? t('profile.providers.newAccountTitle')
            : t('profile.providers.editAccountTitle')
        }
      />
      <TabScreenScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pb-10 pt-4"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FormField
          label={t('profile.providers.name')}
          placeholder={t('profile.providers.namePlaceholder')}
          defaultValue={name}
          autoCapitalize="sentences"
          autoCorrect={false}
          onChangeText={setName}
        />
        <FormField
          label={t('profile.providers.apiKey')}
          placeholder={
            existing === undefined
              ? t('profile.providers.apiKeyPlaceholder')
              : t('profile.providers.apiKeyKeep')
          }
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="password"
          onChangeText={setApiKey}
        />
        <FormField
          label={t('profile.providers.baseUrl')}
          defaultValue={baseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setBaseUrl}
        />
        <FormField
          label={t('profile.providers.models')}
          placeholder={t('profile.providers.modelsPlaceholder')}
          defaultValue={models}
          multiline
          numberOfLines={8}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setModels}
        />
        {existing !== undefined && !isActive ? (
          <Button
            variant="outline"
            className={STATE_ACTION_CLASS}
            onPress={() => {
              setActiveProviderAccount(provider.id, existing.id);
              toast.success(t('profile.providers.activeSet'));
            }}
          >
            <Text>{t('profile.providers.makeActive')}</Text>
          </Button>
        ) : null}
        <Button className={STATE_ACTION_CLASS} onPress={save}>
          <Text>{t('common.save')}</Text>
        </Button>
        {existing === undefined ? null : (
          <Button
            variant="outline-destructive"
            className={STATE_ACTION_CLASS}
            onPress={remove}
          >
            <Text>{t('profile.providers.remove')}</Text>
          </Button>
        )}
      </TabScreenScrollView>
    </View>
  );
}
