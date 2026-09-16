// scripts/health.ts
const url = process.argv[2] || process.env.HEALTH_URL || 'https://ai.bebetterwithjane.com/api/health'

type CheckResult = { ok: boolean; ms: number; error?: string }
type HealthReport = {
  overall: 'green' | 'red'
  checks: Record<'neon' | 'anthropic' | 'clerk', CheckResult>
  at: string
}

async function main() {
  console.log(`Checking ${url} …\n`)
  let report: HealthReport
  try {
    const res = await fetch(url)
    report = (await res.json()) as HealthReport
  } catch (err) {
    console.error(`🔴 Không gọi được endpoint: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
    return
  }
  for (const k of ['neon', 'anthropic', 'clerk'] as const) {
    const c = report.checks[k]
    console.log(`${c.ok ? '🟢' : '🔴'} ${k.padEnd(10)} ${c.ok ? `${c.ms}ms` : c.error || 'lỗi'}`)
  }
  console.log(`\n${report.overall === 'green' ? '🟢 OVERALL: GREEN' : '🔴 OVERALL: RED'}  (${report.at})`)
  process.exit(report.overall === 'green' ? 0 : 1)
}

main()
