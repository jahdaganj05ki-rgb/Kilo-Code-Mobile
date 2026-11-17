import { type TFunction } from 'i18next';

import { type SessionModelOption } from '@/lib/hooks/use-session-model-options';

import { type BackendModel, type StoredChatBackend } from './backend-store';
import {
  backendTargetId,
  decodeBackendTarget,
  decodeLocalTarget,
  providerTargetId,
} from './backend-target';
import { BACKEND_EFFORT_VARIANTS } from './effort';
import { type LocalModelStatus } from './local-models';
import { providerCatalogModels } from './provider-catalog';
import { CHAT_PROVIDER_IDS, chatProvider } from './providers';

export function backendModelOptions(backends: readonly StoredChatBackend[]): SessionModelOption[] {
  return [...accountModelOptions(backends), ...providerModelOptions(backends)];
}

/** A backend the user added on its own is one option per model, under its name. */
function accountModelOptions(backends: readonly StoredChatBackend[]): SessionModelOption[] {
  return backends.flatMap(backend =>
    backend.enabled === false || backend.provider !== undefined
      ? []
      : backend.models.map(model => ({
          id: backendTargetId(backend, model.id),
          name: `${backend.name} · ${model.name}`,
          displayId: model.id,
          variants: model.reasoning ? [...BACKEND_EFFORT_VARIANTS] : [],
          isPreferred: false,
          showGatewayMetadata: false,
          provider: { id: backend.id, name: backend.name },
          capabilities: { tools: model.tools, images: model.images },
          ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
        }))
  );
}

/**
 * A provider's models are one list, not one list per account: two accounts of
 * OpenRouter offer the same catalogue, and the picker must not print each model
 * twice. The union keeps every model any enabled account offers, and the target
 * names the provider rather than the account, so the switch policy — not the
 * picker — decides which key answers.
 */
function providerModelOptions(backends: readonly StoredChatBackend[]): SessionModelOption[] {
  const modelsByProvider = new Map<string, Map<string, BackendModel>>();
  for (const backend of backends) {
    if (backend.enabled !== false && backend.provider !== undefined) {
      const models = modelsByProvider.get(backend.provider) ?? new Map<string, BackendModel>();
      for (const model of backend.models) {
        if (!models.has(model.id)) {
          models.set(model.id, model);
        }
      }
      modelsByProvider.set(backend.provider, models);
    }
  }
  const options: SessionModelOption[] = [];
  for (const providerId of CHAT_PROVIDER_IDS) {
    const provider = chatProvider(providerId);
    // The provider's own last answer wins over the models an account was saved
    // with: an id it no longer lists is not offered, and an id it lists now is
    // (with the capabilities it states). Without a snapshot the saved list is
    // all the app knows, and it stays in use.
    const listed = providerCatalogModels(providerId);
    const models: readonly BackendModel[] =
      listed ?? [...(modelsByProvider.get(providerId)?.values() ?? [])];
    if (provider === undefined) {
      return options;
    }
    for (const model of models) {
      options.push({
        id: providerTargetId(providerId, model.id),
        // The section header names the provider, so the row names the model.
        name: model.name,
        displayId: model.id,
        variants: model.reasoning ? [...BACKEND_EFFORT_VARIANTS] : [],
        isPreferred: false,
        showGatewayMetadata: false,
        provider: { id: provider.id, name: provider.name },
        capabilities: { tools: model.tools, images: model.images },
        ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
      });
    }
  }
  return options;
}

/** An on-device model is offered only while its provider says it is available. */
export function localModelOptions(
  statuses: readonly LocalModelStatus[],
  t: TFunction
): SessionModelOption[] {
  return statuses.flatMap(({ targetId, nameKey, availability }) =>
    availability?.status === 'available'
      ? [
          {
            id: targetId,
            name: t(nameKey),
            displayId: availability.modelId,
            variants: [],
            isPreferred: false,
            showGatewayMetadata: false,
            capabilities: {
              tools: availability.tools === true,
              images: availability.images === true,
            },
            ...(availability.contextWindow > 0
              ? { contextWindow: availability.contextWindow }
              : {}),
          },
        ]
      : []
  );
}

/**
 * The model a new chat starts on: the one the latest chat is on, then Kilo's
 * preferred model, then any Kilo model, then an on-device model, then anything
 * offered. Kilo models are offered only once the catalog has loaded, so while
 * it loads the answer waits for it rather than starting on whatever is there.
 * A catalog that cannot load — offline, or the API down — is not waited for:
 * an on-device model answers with no connection.
 */
export function defaultChatModel(input: {
  readonly options: readonly SessionModelOption[];
  readonly latestChatModel: string | undefined;
  readonly catalogLoading: boolean;
}): string | undefined {
  const { options, latestChatModel, catalogLoading } = input;
  if (options.some(option => option.id === latestChatModel)) {
    return latestChatModel;
  }
  if (catalogLoading) {
    return undefined;
  }
  const kilo = options.filter(
    option =>
      decodeLocalTarget(option.id) === null &&
      decodeBackendTarget(option.id) === null &&
      !option.id.startsWith('provider:')
  );
  return (
    kilo.find(option => option.isPreferred)?.id ??
    kilo[0]?.id ??
    options.find(option => decodeLocalTarget(option.id) !== null)?.id ??
    options[0]?.id
  );
}

/** Kilo, one backend revision, or one on-device provider model. */
function backendIdentity(targetId: string): string {
  const local = decodeLocalTarget(targetId);
  if (local !== null) {
    return `local:${local.provider}:${local.modelId}`;
  }
  // A provider target answers with one of the provider's keys, and which one may
  // change between two messages: it is its own identity, not the gateway's.
  if (targetId.startsWith('provider:')) {
    return targetId;
  }
  const backend = decodeBackendTarget(targetId);
  return backend === null ? 'kilo' : `backend:${backend.backendId}:${backend.revision}`;
}

/** A different backend identity requires consent to transfer the context. */
export function requiresBackendDisclosure(from: string, to: string): boolean {
  return backendIdentity(from) !== backendIdentity(to);
}
