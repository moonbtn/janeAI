import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateHealth, type CheckResult } from '@/lib/health/check'

const ok = (): Promise<CheckResult> => Promise.resolve({ ok: true, ms: 5 })
const bad = (): Promise<CheckResult> => Promise.resolve({ ok: false, ms: 5, error: 'boom' })

test('overall green when all checks pass', async () => {
  const r = await aggregateHealth({ neon: ok, anthropic: ok, clerk: ok })
  assert.equal(r.overall, 'green')
  assert.equal(r.checks.neon.ok, true)
  assert.ok(typeof r.at === 'string')
})

test('overall red when any check fails', async () => {
  const r = await aggregateHealth({ neon: ok, anthropic: bad, clerk: ok })
  assert.equal(r.overall, 'red')
  assert.equal(r.checks.anthropic.error, 'boom')
})

test('a hanging check is reported failed, not left hanging', async () => {
  const hang = () => new Promise<CheckResult>(() => {}) // never resolves
  const r = await aggregateHealth(
    { neon: ok, anthropic: hang, clerk: ok },
    { timeoutMs: 50 },
  )
  assert.equal(r.overall, 'red')
  assert.equal(r.checks.anthropic.ok, false)
})
