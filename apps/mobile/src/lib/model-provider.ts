import { stripModelPrefix } from './model-id';

/**
 * The vendor a gateway model id names. The wire catalogue carries no provider
 * field for a gateway model — its id is `<vendor>/<model>` — so the picker reads
 * the vendor from the id and names it here. A vendor the table does not list
 * keeps its slug rather than a guessed brand name.
 */
const VENDOR_NAMES: Readonly<Record<string, string>> = {
  alibaba: 'Alibaba',
  amazon: 'Amazon',
  anthropic: 'Anthropic',
  'arcee-ai': 'Arcee AI',
  baidu: 'Baidu',
  bytedance: 'ByteDance',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  google: 'Google',
  inception: 'Inception',
  liquid: 'Liquid AI',
  'meta-llama': 'Meta',
  meta: 'Meta',
  microsoft: 'Microsoft',
  minimax: 'MiniMax',
  mistral: 'Mistral AI',
  mistralai: 'Mistral AI',
  moonshot: 'Moonshot AI',
  moonshotai: 'Moonshot AI',
  nousresearch: 'Nous Research',
  nvidia: 'NVIDIA',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  poolside: 'Poolside',
  qwen: 'Qwen',
  stepfun: 'StepFun',
  tencent: 'Tencent',
  'x-ai': 'xAI',
  xai: 'xAI',
  'z-ai': 'Z.ai',
  zai: 'Z.ai',
};

/**
 * Kilo's own models are not a vendor group: they are the picker's curated
 * picks and stay in Recommended (or All models when a tier is not recommended).
 */
const KILO_OWN_PREFIXES = new Set(['kilo-auto']);

/** A direct-BYOK id is `<provider>-byok/<model>`; its vendor is the provider. */
const BYOK_ID_SUFFIX = '-byok';

/**
 * The provider a gateway model belongs to, derived from its id, or `undefined`
 * when the id names no vendor (Kilo's own models, or an id without a prefix).
 */
export function providerForModelId(
  modelId: string | null | undefined
): { id: string; name: string } | undefined {
  const normalized = stripModelPrefix(modelId).toLowerCase();
  const separator = normalized.indexOf('/');
  if (separator <= 0) {
    return undefined;
  }

  const prefix = normalized.slice(0, separator);
  if (KILO_OWN_PREFIXES.has(prefix)) {
    return undefined;
  }

  const vendor = prefix.endsWith(BYOK_ID_SUFFIX)
    ? prefix.slice(0, -BYOK_ID_SUFFIX.length)
    : prefix;
  return { id: vendor, name: VENDOR_NAMES[vendor] ?? vendor };
}
