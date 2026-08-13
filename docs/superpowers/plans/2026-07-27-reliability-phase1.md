# Reliability Phase 1 — "Demo không vỡ trận" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jane AI có health-check bấm-1-phát biết xanh/đỏ, và tính năng AI không chết khi Anthropic gỡ model cũ.

**Architecture:** (1) Gom model id về 1 module với chuỗi fallback, các route AI trực tiếp gọi qua helper tự lùi model khi model chính bị gỡ. (2) Module health thuần (kiểm Supabase/Anthropic/Clerk song song, có timeout) đứng sau endpoint `/api/health`, trang `/status`, và script `npm run health`. (3) Dọn mìn: deploy fix reminder, ngày bootcamp, cảnh báo local-dùng-DB-remote.

**Tech Stack:** Next.js 16 (App Router, route handlers), `@anthropic-ai/sdk`, `@supabase/supabase-js`, Clerk, TypeScript, `node --test` + `tsx`.

**Repo conventions (đọc trước khi code):**
- Route handler = `export async function GET/POST(...)` trong `src/app/api/**/route.ts`, thường có `export const dynamic = 'force-dynamic'`. Tham chiếu mẫu: `src/app/api/keepalive/route.ts`.
- Anthropic client trực tiếp: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` rồi `client.messages.create(...)`.
- Supabase admin: `getSupabaseAdmin()` từ `@/lib/supabase`.
- Unit test chạy bằng `node --import tsx --test tests/**/*.test.ts` (xem `package.json` script `test:unit`), dùng `node:test` + `node:assert/strict`.
- AGENTS.md: Next.js bản này có thể khác bản bạn biết — theo đúng mẫu file đã có trong repo, đừng bịa API.
- **Chạy test/script bằng `env -u ANTHROPIC_BASE_URL ...`** nếu gặp lỗi Anthropic 404 (harness set biến này).

---

### Task 1: Central AI model config + fallback helper

**Files:**
- Create: `src/lib/ai/models.ts`
- Test: `tests/ai-models.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ai-models.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_TIERS, getModel, callAnthropicWithFallback } from '../src/lib/ai/models.ts'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL node --import tsx --test tests/ai-models.test.ts`
Expected: FAIL — cannot find module `../src/lib/ai/models.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/ai/models.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `env -u ANTHROPIC_BASE_URL node --import tsx --test tests/ai-models.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/ai/models.ts tests/ai-models.test.ts
git commit -m "feat(ai): central model config + fallback helper"
```

---

### Task 2: Wire /api/generate to model fallback

**Files:**
- Modify: `src/app/api/generate/route.ts`

- [ ] **Step 1: Replace the streaming call with the fallback helper**

In `src/app/api/generate/route.ts`, add the import near the top (after the existing imports):

```ts
import { callAnthropicWithFallback } from '@/lib/ai/models'
```

Replace the block that currently builds `stream` and derives `generatedJd` (the `const stream = await client.messages.stream({ model: 'claude-opus-4-7', ... })` down through `const generatedJd = message.content[0].type === 'text' ? message.content[0].text : ''`) with:

```ts
    const message = await callAnthropicWithFallback(client, 'heavy', {
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Bạn là chuyên gia viết JD (Job Description) cho thị trường tuyển dụng Việt Nam.

Hãy viết một JD chuyên nghiệp, hấp dẫn bằng tiếng Việt dựa trên thông tin sau:

**Vị trí tuyển dụng:** ${jobTitle}

**Yêu cầu thô từ khách hàng:**
${rawInput}

Viết JD theo cấu trúc sau:
1. **Giới thiệu công ty/vị trí** (2-3 câu hấp dẫn)
2. **Mô tả công việc** (bullet points, 5-7 điểm)
3. **Yêu cầu ứng viên** (bullet points, 5-6 điểm)
4. **Quyền lợi** (bullet points, 4-5 điểm)
5. **Thông tin ứng tuyển**

Viết tự nhiên, chuyên nghiệp, hấp dẫn ứng viên. Không bịa thông tin không có trong yêu cầu gốc.`,
        },
      ],
    })

    const firstBlock = message.content[0]
    const generatedJd = firstBlock?.type === 'text' ? firstBlock.text : ''
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/generate/route.ts
git commit -m "feat(generate): use model fallback instead of hardcoded opus-4-7"
```

---

### Task 3: Wire /api/questionnaire/generate to model fallback

**Files:**
- Modify: `src/app/api/questionnaire/generate/route.ts`

- [ ] **Step 1: Swap the create call**

Add import after existing imports:

```ts
import { callAnthropicWithFallback } from '@/lib/ai/models'
```

Replace the existing `const message = await client.messages.create({ model: 'claude-opus-4-7', max_tokens: 6000, messages: [...] })` with:

```ts
    const message = await callAnthropicWithFallback(client, 'heavy', {
      max_tokens: 6000,
      messages: [
        {
          role: 'user',
          content: buildPrompt(jdText, providedTitle, language),
        },
      ],
    })
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/questionnaire/generate/route.ts
git commit -m "feat(questionnaire): use model fallback instead of hardcoded opus-4-7"
```

---

### Task 4: Wire /api/post-job/generate to model fallback (3 call sites)

**Files:**
- Modify: `src/app/api/post-job/generate/route.ts` (calls near lines 387, 436, 476)

- [ ] **Step 1: Add import**

After existing imports:

```ts
import { callAnthropicWithFallback } from '@/lib/ai/models'
```

- [ ] **Step 2: Replace each `client.messages.create({ model: ..., ... })`**

For the two `model: 'claude-opus-4-7'` calls: change `const message = await client.messages.create({ model: 'claude-opus-4-7', ...rest })` to `const message = await callAnthropicWithFallback(client, 'heavy', { ...rest })` (keep the exact `max_tokens`/`messages` that were there; just drop the `model` key and route through the helper).

For the `model: 'claude-haiku-4-5-20251001'` call (the lighter reply step): change to `await callAnthropicWithFallback(client, 'fast', { ...rest })`.

Preserve the surrounding variable names (`message`, `replyMsg`, etc.) exactly as they are.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/post-job/generate/route.ts
git commit -m "feat(post-job): route all AI calls through model fallback (heavy/fast tiers)"
```

---

### Task 5: Point recruiting-chat default at central config

**Files:**
- Modify: `src/lib/recruiting-rag/runtime.ts:14`

- [ ] **Step 1: Replace the hardcoded default**

Add import at top:

```ts
import { getModel } from '@/lib/ai/models'
```

Replace line 14 `const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-7'` with:

```ts
const ANTHROPIC_DEFAULT_MODEL = getModel('heavy')
```

(Leaves the `RECRUITING_CHAT_ANTHROPIC_MODEL` env override untouched; only the fallback default now tracks the central config.)

- [ ] **Step 2: Run existing recruiting tests + typecheck**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL node --import tsx --test tests/recruiting-rag.test.ts tests/recruiting-api.test.ts`
Expected: exit 0, tests pass. (The runtime test "defaults the recruiting chat to Anthropic" should still pass — it asserts provider, not exact model id. If a test asserts the literal `claude-opus-4-7`, update it to `getModel('heavy')`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/recruiting-rag/runtime.ts tests/
git commit -m "feat(chat): default recruiting model from central config"
```

---

### Task 6: Health aggregation logic (pure, injectable)

**Files:**
- Create: `src/lib/health/check.ts`
- Test: `tests/health-check.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/health-check.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateHealth, type CheckResult } from '../src/lib/health/check.ts'

const ok = (): Promise<CheckResult> => Promise.resolve({ ok: true, ms: 5 })
const bad = (): Promise<CheckResult> => Promise.resolve({ ok: false, ms: 5, error: 'boom' })

test('overall green when all checks pass', async () => {
  const r = await aggregateHealth({ supabase: ok, anthropic: ok, clerk: ok })
  assert.equal(r.overall, 'green')
  assert.equal(r.checks.supabase.ok, true)
  assert.ok(typeof r.at === 'string')
})

test('overall red when any check fails', async () => {
  const r = await aggregateHealth({ supabase: ok, anthropic: bad, clerk: ok })
  assert.equal(r.overall, 'red')
  assert.equal(r.checks.anthropic.error, 'boom')
})

test('a hanging check is reported failed, not left hanging', async () => {
  const hang = () => new Promise<CheckResult>(() => {}) // never resolves
  const r = await aggregateHealth(
    { supabase: ok, anthropic: hang, clerk: ok },
    { timeoutMs: 50 },
  )
  assert.equal(r.overall, 'red')
  assert.equal(r.checks.anthropic.ok, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL node --import tsx --test tests/health-check.test.ts`
Expected: FAIL — cannot find module `../src/lib/health/check.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/health/check.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `env -u ANTHROPIC_BASE_URL node --import tsx --test tests/health-check.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/health/check.ts tests/health-check.test.ts
git commit -m "feat(health): pure health aggregation logic with per-check timeout"
```

---

### Task 7: Real dependency checks + /api/health route

**Files:**
- Modify: `src/lib/health/check.ts` (add the three real check functions + `runHealthChecks`)
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Add real checks to `src/lib/health/check.ts`**

Append to the file:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getModel } from '@/lib/ai/models'

async function checkSupabase(): Promise<CheckResult> {
  const start = Date.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (getSupabaseAdmin() as any)
    .from('jd_history')
    .select('id', { count: 'exact', head: true })
  if (error) return { ok: false, ms: Date.now() - start, error: error.message }
  return { ok: true, ms: Date.now() - start }
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
  return aggregateHealth({ supabase: checkSupabase, anthropic: checkAnthropic, clerk: checkClerk })
}
```

- [ ] **Step 2: Create the route**

```ts
// src/app/api/health/route.ts
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { runHealthChecks } from '@/lib/health/check'

export async function GET() {
  const report = await runHealthChecks()
  return NextResponse.json(report, { status: report.overall === 'green' ? 200 : 503 })
}
```

- [ ] **Step 3: Typecheck + rerun health unit tests (must still pass)**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL node --import tsx --test tests/health-check.test.ts`
Expected: exit 0; 3 tests pass (aggregation logic unchanged).

- [ ] **Step 4: Smoke test the live endpoint**

Start the dev server (via the run/preview tooling, not a raw backgrounded `next dev`), then:
Run: `env -u ANTHROPIC_BASE_URL curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health` and `curl -s http://localhost:3000/api/health`
Expected: HTTP 200 and JSON `{"overall":"green","checks":{...}}`. If red, read which check failed and fix before committing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/health/check.ts src/app/api/health/route.ts
git commit -m "feat(health): /api/health checking supabase, anthropic (primary model), clerk"
```

---

### Task 8: /status page

**Files:**
- Create: `src/app/status/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/status/page.tsx
'use client'

import { useEffect, useState } from 'react'

type CheckResult = { ok: boolean; ms: number; error?: string }
type HealthReport = {
  overall: 'green' | 'red'
  checks: Record<'supabase' | 'anthropic' | 'clerk', CheckResult>
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
            {(['supabase', 'anthropic', 'clerk'] as const).map((k) => (
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
```

- [ ] **Step 2: Typecheck + smoke test**

Run: `npx tsc --noEmit`, then load `http://localhost:3000/status` in the preview browser and confirm 3 rows render with 🟢.
Expected: exit 0; page shows green dots.

- [ ] **Step 3: Commit**

```bash
git add src/app/status/page.tsx
git commit -m "feat(status): public /status page rendering health checks"
```

---

### Task 9: `npm run health` script

**Files:**
- Create: `scripts/health.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create the script**

```ts
// scripts/health.ts
const url = process.argv[2] || process.env.HEALTH_URL || 'https://ai.bebetterwithjane.com/api/health'

type CheckResult = { ok: boolean; ms: number; error?: string }
type HealthReport = {
  overall: 'green' | 'red'
  checks: Record<'supabase' | 'anthropic' | 'clerk', CheckResult>
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
  for (const k of ['supabase', 'anthropic', 'clerk'] as const) {
    const c = report.checks[k]
    console.log(`${c.ok ? '🟢' : '🔴'} ${k.padEnd(10)} ${c.ok ? `${c.ms}ms` : c.error || 'lỗi'}`)
  }
  console.log(`\n${report.overall === 'green' ? '🟢 OVERALL: GREEN' : '🔴 OVERALL: RED'}  (${report.at})`)
  process.exit(report.overall === 'green' ? 0 : 1)
}

main()
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
    "health": "node --import tsx scripts/health.ts"
```

- [ ] **Step 3: Test against local dev server**

Run: `npm run health -- http://localhost:3000/api/health`
Expected: prints 3 green rows + `🟢 OVERALL: GREEN`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/health.ts package.json
git commit -m "feat(health): npm run health script (defaults to prod)"
```

---

### Task 10: Dev guardrail — warn when local uses a remote DB

**Files:**
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Add a one-time warning helper and call it in the admin getter**

At the top of `src/lib/supabase.ts` after the import, add:

```ts
let _warnedRemoteDb = false
function warnIfLocalUsingRemoteDb() {
  if (_warnedRemoteDb) return
  if (process.env.NODE_ENV !== 'development') return
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1')
  if (url && !isLocal) {
    _warnedRemoteDb = true
    console.warn(
      `\n⚠️  LOCAL DEV đang dùng Supabase REMOTE (${url}).\n` +
      `    Mọi thao tác GHI sẽ đụng DB thật. Cẩn thận khi test/xoá.\n`,
    )
  }
}
```

Then call `warnIfLocalUsingRemoteDb()` as the first line inside both `getSupabase()` and `getSupabaseAdmin()` (before the `if (!_client)` / `if (!_adminClient)` checks).

- [ ] **Step 2: Typecheck + observe the warning locally**

Run: `npx tsc --noEmit`, then restart the dev server and hit any DB-backed route (e.g. `/api/keepalive`); confirm the ⚠️ warning appears once in the server logs.
Expected: exit 0; warning printed exactly once.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "chore(dev): warn when local dev points at a remote Supabase"
```

---

### Task 11: Deploy Phase 1 + verify green

**Files:** none (deploy + verification)

- [ ] **Step 1: Full local gate**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run test:unit`
Expected: exit 0; all tests pass (previous 58 + new ai-models + health-check tests).

- [ ] **Step 2: Deploy to production**

Use the `deploy-jane-ai` skill (do NOT run `vercel --prod` directly). This ships everything on the branch, including the already-committed reminder fix (`src/app/app/page.tsx`) and all Phase 1 work.

- [ ] **Step 3: Verify prod is green**

Run: `npm run health`
Expected: `🟢 OVERALL: GREEN`. Also open `https://ai.bebetterwithjane.com/status` on a phone and confirm 3 green dots.

- [ ] **Step 4: Verify the reminder fix on prod**

Log into the prod dashboard and confirm reminders now show as one collapsed badge (not a wall).

---

## Self-Review

**Spec coverage:**
- 1.1 health endpoint → Tasks 6, 7 ✓
- 1.2 `npm run health` → Task 9 ✓
- 1.3 `/status` page → Task 8 ✓
- 1.4 model config + fallback → Tasks 1–5 ✓
- 1.5 deploy reminder fix → Task 11; dev guardrail → Task 10 ✓ (bootcamp is a separate product, out of scope for this plan)
- Testing (health aggregation, model fallback) → Tasks 1, 6 ✓

**Placeholder scan:** No placeholders — all mechanics fully specified.

**Type consistency:** `CheckResult`/`HealthReport` shapes match across `check.ts`, the route, `/status`, and `scripts/health.ts`. `getModel`/`callAnthropicWithFallback`/`MODEL_TIERS` signatures consistent across Tasks 1–5, 7. `runHealthChecks()`/`aggregateHealth()` names consistent between Tasks 6 and 7.
