export type CheckResult = { ok: boolean; ms: number; error?: string }

export type HealthReport = {
  overall: 'green' | 'red'
  checks: { supabase: CheckResult; anthropic: CheckResult; clerk: CheckResult }
  at: string
}

type CheckFn = () => Promise<CheckResult>

async function withTimeout(fn: CheckFn, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now()
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), timeoutMs),
      ),
    ])
    return result
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function aggregateHealth(
  checks: { supabase: CheckFn; anthropic: CheckFn; clerk: CheckFn },
  opts: { timeoutMs?: number } = {},
): Promise<HealthReport> {
  const timeoutMs = opts.timeoutMs ?? 8000
  const [supabase, anthropic, clerk] = await Promise.all([
    withTimeout(checks.supabase, timeoutMs),
    withTimeout(checks.anthropic, timeoutMs),
    withTimeout(checks.clerk, timeoutMs),
  ])
  const all = [supabase, anthropic, clerk]
  return {
    overall: all.every((c) => c.ok) ? 'green' : 'red',
    checks: { supabase, anthropic, clerk },
    at: new Date().toISOString(),
  }
}
