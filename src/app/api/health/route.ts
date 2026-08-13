export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { runHealthChecks } from '@/lib/health/check'

export async function GET() {
  const report = await runHealthChecks()
  return NextResponse.json(report, { status: report.overall === 'green' ? 200 : 503 })
}
