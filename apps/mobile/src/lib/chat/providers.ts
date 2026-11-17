import { z } from 'zod';

/**
 * The providers whose accounts the app manages itself.
 *
 * A provider here is an OpenAI-compatible endpoint the user pays for directly:
 * NVIDIA NIM and OpenRouter. An account is one stored chat backend linked to a
 * provider — it carries its own key — and several accounts of one provider let a
 * request start on one key and continue on the next. The names are brand names,
 * so they are not translated copy.
 */
export const CHAT_PROVIDER_IDS = ['nvidia-nim', 'openrouter'] as const;

export type ChatProviderId = (typeof CHAT_PROVIDER_IDS)[number];

export type ChatProvider = Readonly<{
  id: ChatProviderId;
  name: string;
  /** Prefilled into a new account's base URL; the user may still change it. */
  baseUrl: string;
}>;

export const CHAT_PROVIDERS = {
  'nvidia-nim': {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
} satisfies Record<ChatProviderId, ChatProvider>;

/** A stored id is untrusted input, so it is parsed rather than inspected. */
const providerIdSchema = z.enum(CHAT_PROVIDER_IDS);

export function isChatProviderId(value: unknown): value is ChatProviderId {
  return providerIdSchema.safeParse(value).success;
}

export function chatProvider(id: string): ChatProvider | undefined {
  return isChatProviderId(id) ? CHAT_PROVIDERS[id] : undefined;
}

/** The provider a model row names: its brand name, never a translated one. */
export function chatProviderName(id: ChatProviderId): string {
  return CHAT_PROVIDERS[id].name;
}
