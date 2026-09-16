import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db/client'
import { jdHistory } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { getModel } from '@/lib/ai/models'

export type CheckResult = { ok: boolean; ms: number; error?: string }

export type HealthReport = {
  overall: 'green' | 'red'
  checks: { neon: CheckResult; anthropic: CheckResult; clerk: CheckResult }
  at: string
}

type CheckFn = () => Promise<CheckResult>

async function withTimeout(fn: CheckFn, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error('timeout')), timeoutMs)
      }),
    ])
    return result
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

export async function aggregateHealth(
  checks: { neon: CheckFn; anthropic: CheckFn; clerk: CheckFn },
  opts: { timeoutMs?: number } = {},
): Promise<HealthReport> {
  const timeoutMs = opts.timeoutMs ?? 8000
  const [neon, anthropic, clerk] = await Promise.all([
    withTimeout(checks.neon, timeoutMs),
    withTimeout(checks.anthropic, timeoutMs),
    withTimeout(checks.clerk, timeoutMs),
  ])
  const all = [neon, anthropic, clerk]
  return {
    overall: all.every((c) => c.ok) ? 'green' : 'red',
    checks: { neon, anthropic, clerk },
    at: new Date().toISOString(),
  }
}

async function checkNeon(): Promise<CheckResult> {
  const start = Date.now()
  try {
    await getDb().select({ count: sql<number>`count(*)`.mapWith(Number) }).from(jdHistory)
    return { ok: true, ms: Date.now() - start }
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
  }
}

// Checks the PRIMARY model directly (no fallback) so retirement shows red here
// even while the app keeps working via fallback — this is the early-warning signal.
async function checkAnthropic(): Promise<CheckResult> {
  const start = Date.now()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  await client.messages.create({
    model: getModel('heavy'),
    max_tokens: 1,
    messages: [{ role: 'user', content: 'ping' }],
  })
  return { ok: true, ms: Date.now() - start }
}

// Derive the Clerk Frontend API host from the publishable key and hit JWKS.
// Cheap reachability + key-config check, no secret needed.
function clerkFapiDomain(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  const b64 = pk.replace(/^pk_(test|live)_/, '')
  const decoded = Buffer.from(b64, 'base64').toString('utf8')
  return decoded.replace(/\$+$/, '')
}

async function checkClerk(): Promise<CheckResult> {
  const start = Date.now()
  const domain = clerkFapiDomain()
  if (!domain) return { ok: false, ms: Date.now() - start, error: 'missing/invalid publishable key' }
  const res = await fetch(`https://${domain}/.well-known/jwks.json`)
  if (!res.ok) return { ok: false, ms: Date.now() - start, error: `jwks ${res.status}` }
  return { ok: true, ms: Date.now() - start }
}

export function runHealthChecks(): Promise<HealthReport> {
  return aggregateHealth({ neon: checkNeon, anthropic: checkAnthropic, clerk: checkClerk })
}
