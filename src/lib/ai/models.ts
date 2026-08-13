import type Anthropic from '@anthropic-ai/sdk'

export type ModelTier = 'heavy' | 'fast'

// Single source of truth for model ids. Primary first, fallbacks after.
// All ids verified resolvable as of 2026-07-27.
export const MODEL_TIERS: Record<ModelTier, string[]> = {
  heavy: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  fast: ['claude-haiku-4-5-20251001', 'claude-opus-4-7'],
}

export function getModel(tier: ModelTier): string {
  return MODEL_TIERS[tier][0]
}

// True when the error means "this model id can't be used" (retired/unknown),
// so we should try the next model. False for auth/rate-limit/server errors.
export function isModelUnavailableError(err: unknown): boolean {
  const e = err as {
    status?: number
    error?: { error?: { type?: string; message?: string } }
    message?: string
  }
  if (e?.status === 404) return true
  if (e?.error?.error?.type === 'not_found_error') return true
  const msg = (e?.error?.error?.message || e?.message || '').toLowerCase()
  return msg.includes('model') &&
    (msg.includes('not found') || msg.includes('deprecat') ||
     msg.includes('unavailable') || msg.includes('does not exist'))
}

type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>

export async function callAnthropicWithFallback(
  client: Anthropic,
  tier: ModelTier,
  params: CreateParams,
): Promise<Anthropic.Message> {
  const models = MODEL_TIERS[tier]
  let lastErr: unknown
  for (const model of models) {
    try {
      return await client.messages.create({ model, ...params })
    } catch (err) {
      lastErr = err
      if (isModelUnavailableError(err)) {
        console.error(`AI model "${model}" unavailable, falling back...`, err)
        continue
      }
      throw err
    }
  }
  throw lastErr
}
