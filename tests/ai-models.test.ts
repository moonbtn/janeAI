import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_TIERS, getModel, callAnthropicWithFallback } from '@/lib/ai/models'

function fakeClient(behavior: (model: string) => unknown) {
  const calls: string[] = []
  return {
    calls,
    messages: {
      create: async ({ model }: { model: string }) => {
        calls.push(model)
        const result = behavior(model)
        if (result instanceof Error) throw result
        return result
      },
    },
  }
}

function modelNotFound() {
  return Object.assign(new Error('model: not found'), { status: 404 })
}

test('getModel returns the primary of a tier', () => {
  assert.equal(getModel('heavy'), MODEL_TIERS.heavy[0])
})

test('uses primary model when it succeeds', async () => {
  const c = fakeClient(() => ({ ok: true }))
  const res = await callAnthropicWithFallback(c as never, 'heavy', { max_tokens: 8, messages: [] })
  assert.deepEqual(res, { ok: true })
  assert.deepEqual(c.calls, [MODEL_TIERS.heavy[0]])
})

test('falls back to next model when primary is retired (404)', async () => {
  const c = fakeClient((model) => (model === MODEL_TIERS.heavy[0] ? modelNotFound() : { ok: true }))
  const res = await callAnthropicWithFallback(c as never, 'heavy', { max_tokens: 8, messages: [] })
  assert.deepEqual(res, { ok: true })
  assert.deepEqual(c.calls, [MODEL_TIERS.heavy[0], MODEL_TIERS.heavy[1]])
})

test('does NOT fall back on non-model errors (e.g. 429)', async () => {
  const c = fakeClient(() => Object.assign(new Error('rate limit'), { status: 429 }))
  await assert.rejects(
    () => callAnthropicWithFallback(c as never, 'heavy', { max_tokens: 8, messages: [] }),
    /rate limit/,
  )
  assert.equal(c.calls.length, 1)
})
