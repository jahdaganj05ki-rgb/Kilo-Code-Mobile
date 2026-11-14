import { z } from 'zod';

import { normalizeBackendUrl } from './backend-url';
import { type BackendModel } from './backend-store';
import { remoteChatGet } from './fetch';

/**
 * The model list an OpenAI-compatible provider publishes at `<baseUrl>/models`.
 *
 * OpenRouter answers with the capability fields this app needs — whether a model
 * accepts tools, images and reasoning effort — and NVIDIA NIM answers with ids
 * only. A field the provider does not state is read as unsupported: sending tool
 * definitions or image parts to an endpoint that refuses them fails the whole
 * request, while a model the picker under-describes still answers text.
 */
export type ProviderModelsProblem = 'invalidKey' | 'unavailable' | 'empty';

export class ProviderModelsError extends Error {
  readonly problem: ProviderModelsProblem;

  constructor(problem: ProviderModelsProblem) {
    super(problem);
    this.problem = problem;
  }
}

/** A provider that publishes thousands of ids still gets one picker list. */
const MAX_MODELS = 2000;

const modelSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().optional(),
    architecture: z.object({ input_modalities: z.array(z.string()).optional() }).optional(),
    supported_parameters: z.array(z.string()).optional(),
  })
  .strip();

const responseSchema = z.object({ data: z.array(modelSchema) }).strip();

function toModel(entry: z.infer<typeof modelSchema>): BackendModel {
  const modalities = entry.architecture?.input_modalities ?? [];
  const parameters = entry.supported_parameters ?? [];
  const name = entry.name?.trim();
  return {
    id: entry.id,
    name: name === undefined || name === '' ? entry.id : name,
    tools: parameters.includes('tools'),
    images: modalities.includes('image'),
    reasoning: parameters.includes('reasoning') || parameters.includes('include_reasoning'),
  };
}

/**
 * Reads the provider's catalogue with the account's own key.
 *
 * The call goes through `remoteChatGet`, so it leaves the app without cookies,
 * without redirects, and only over a transport the app already accepts for a
 * custom endpoint. A key the provider rejects is reported as such instead of as
 * a network failure, because the two ask the user for different things.
 */
export async function fetchProviderModels(input: {
  readonly baseUrl: string;
  readonly apiKey: string;
}): Promise<BackendModel[]> {
  const base = normalizeBackendUrl(input.baseUrl, false).replace(/\/+$/u, '');
  const response = await remoteChatGet(`${base}/models`, {
    Authorization: `Bearer ${input.apiKey}`,
    Accept: 'application/json',
  });
  if (response.status === 401 || response.status === 403) {
    throw new ProviderModelsError('invalidKey');
  }
  if (!response.ok) {
    throw new ProviderModelsError('unavailable');
  }
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new ProviderModelsError('unavailable');
  }
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProviderModelsError('unavailable');
  }
  const seen = new Set<string>();
  const models: BackendModel[] = [];
  for (const entry of parsed.data.data) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    models.push(toModel(entry));
    if (models.length === MAX_MODELS) {
      break;
    }
  }
  if (models.length === 0) {
    throw new ProviderModelsError('empty');
  }
  return models;
}
