/**
 * The provider every catalog model the Kilo gateway serves belongs to.
 *
 * The wire catalog names no provider for a gateway model — its id is
 * `<vendor>/<model>` — so the picker used to split the gateway into one section
 * per vendor. That grouping named the model's author, not who serves and bills
 * the request: an `anthropic/…` model, an `openai/…` model and a `kilo-auto/…`
 * model all run on gateway credit under the user's Kilo account. The picker
 * groups by the latter, so every gateway model is one section.
 *
 * A model served by the user's own provider account is grouped by that account's
 * provider instead, which is a property of the stored backend and not of the id.
 */
export const KILO_GATEWAY_PROVIDER = {
  id: 'kilo-gateway',
  name: 'Kilo Gateway',
} satisfies Readonly<{ id: string; name: string }>;
