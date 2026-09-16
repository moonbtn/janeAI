// src/app/status/page.tsx
'use client'

import { useEffect, useState } from 'react'

type CheckResult = { ok: boolean; ms: number; error?: string }
type HealthReport = {
  overall: 'green' | 'red'
  checks: Record<'neon' | 'anthropic' | 'clerk', CheckResult>
  at: string
}

export default function StatusPage() {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: HealthReport) => setReport(d))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  const dot = (ok: boolean) => (ok ? '🟢' : '🔴')

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Jane AI — Status</h1>
      {loading && <p>Đang kiểm tra…</p>}
      {failed && <p style={{ color: '#c0392b' }}>🔴 Không gọi được /api/health (app có thể đang down).</p>}
      {report && (
        <>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            {report.overall === 'green' ? '🟢 Tất cả bình thường' : '🔴 Có sự cố'}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['neon', 'anthropic', 'clerk'] as const).map((k) => (
              <li key={k} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #eee', borderRadius: 10, padding: '10px 14px' }}>
                <span>{dot(report.checks[k].ok)} {k}</span>
                <span style={{ color: '#888', fontSize: 13 }}>
                  {report.checks[k].ok ? `${report.checks[k].ms}ms` : (report.checks[k].error || 'lỗi')}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ color: '#aaa', fontSize: 12, marginTop: 16 }}>Checked at {report.at}</p>
        </>
      )}
    </div>
  )
}
