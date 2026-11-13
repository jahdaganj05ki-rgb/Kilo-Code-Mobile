import { describe, expect, it } from 'vitest';

import { providerForModelId } from './model-provider';

describe('providerForModelId', () => {
  it.each([
    ['anthropic/claude-sonnet-4.6', 'anthropic', 'Anthropic'],
    ['openai/gpt-5', 'openai', 'OpenAI'],
    ['google/gemini-3-pro', 'google', 'Google'],
    ['moonshotai/kimi-k2', 'moonshotai', 'Moonshot AI'],
    ['x-ai/grok-4', 'x-ai', 'xAI'],
    ['z-ai/glm-5', 'z-ai', 'Z.ai'],
    // The picker's display ids may carry the legacy `kilocode/` prefix.
    ['kilocode/anthropic/claude-sonnet-4.6', 'anthropic', 'Anthropic'],
  ])('reads the vendor from %s', (id, vendorId, name) => {
    expect(providerForModelId(id)).toEqual({ id: vendorId, name });
  });

  it('names a direct-BYOK model by the provider its id is prefixed with', () => {
    expect(providerForModelId('nvidia-byok/nvidia-nemotron-4')).toEqual({
      id: 'nvidia',
      name: 'NVIDIA',
    });
  });

  it('keeps an unlisted vendor slug rather than guessing a brand name', () => {
    expect(providerForModelId('groq/llama-4')).toEqual({ id: 'groq', name: 'groq' });
  });

  it.each(['kilo-auto/efficient', 'kilo-auto/free', 'kilocode/kilo-auto/free'])(
    "leaves Kilo's own %s out of the provider sections",
    id => {
      expect(providerForModelId(id)).toBeUndefined();
    }
  );

  it.each(['unprefixed', '/leading-slash', '', undefined, null])(
    'answers no provider for %p',
    id => {
      expect(providerForModelId(id)).toBeUndefined();
    }
  );
});
