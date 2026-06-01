# Re-Questionnaire & Hired Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let recruiters re-send pre-filled questionnaires to the hiring manager, see 30-day in-app reminders for active JDs, and mark positions as hired.

**Architecture:** Add a `status` column to `jd_history` and an `is_resend` flag to `questionnaires`. A new `/api/questionnaire/resend` endpoint creates a fresh questionnaire pre-populated from the previous submission. A `/api/reminders` endpoint computes on-the-fly which active JDs have gone 30 days without a new submission. The app page fetches reminders on load and renders dismissible banners.

**Tech Stack:** Next.js App Router API routes, Supabase (postgres), TypeScript, Tailwind CSS

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/lib/supabase.ts` |
| Create | `src/app/api/jd-history/[id]/status/route.ts` |
| Create | `src/app/api/reminders/route.ts` |
| Create | `src/app/api/questionnaire/resend/route.ts` |
| Modify | `src/app/api/history/route.ts` |
| Modify | `src/app/api/q/[token]/route.ts` |
| Modify | `src/components/QuestionnaireWizard.tsx` |
| Modify | `src/app/q/[token]/page.tsx` |
| Modify | `src/app/app/page.tsx` |

---

### Task 1: DB migration + type updates

**Files:**
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Run SQL migration in Supabase dashboard**

Go to Supabase → SQL Editor and run:
```sql
ALTER TABLE jd_history ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS is_resend BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Update JdHistory type**

In `src/lib/supabase.ts`, update `JdHistory`:
```typescript
export type JdHistory = {
  id: string
  job_title: string
  raw_input: string
  generated_jd: string
  created_at: string
  status: 'active' | 'hired'
}
```

- [ ] **Step 3: Update Questionnaire type**

In `src/lib/supabase.ts`, update `Questionnaire`:
```typescript
export type Questionnaire = {
  id: string
  jd_history_id: string
  token: string
  questions: Question[]
  prefilled_answers: Record<string, unknown>
  status: 'pending' | 'answered'
  language: 'vi' | 'en'
  expires_at: string
  created_at: string
  is_resend: boolean
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add status to JdHistory and is_resend to Questionnaire types"
```

---

### Task 2: API — PATCH /api/jd-history/[id]/status

**Files:**
- Create: `src/app/api/jd-history/[id]/status/route.ts`

- [ ] **Step 1: Create route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabase } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status } = await req.json() as { status: string }

  if (status !== 'active' && status !== 'hired') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (getSupabase() as any)
    .from('jd_history')
    .update({ status })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/jd-history/[id]/status/route.ts
git commit -m "feat: add PATCH /api/jd-history/[id]/status endpoint"
```

---

### Task 3: API — GET /api/reminders

**Files:**
- Create: `src/app/api/reminders/route.ts`

Logic: for each `active` JD owned by the user, find the latest questionnaire → latest answer. If `submitted_at` is ≥ 30 days ago (and there is no newer `pending` questionnaire), include it in the result.

- [ ] **Step 1: Create route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabase } from '@/lib/supabase'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabase() as any

  const { data: jds, error } = await sb
    .from('jd_history')
    .select('id, job_title, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error) return NextResponse.json({ reminders: [] })

  const reminders: { jd_history_id: string; job_title: string }[] = []

  for (const jd of jds ?? []) {
    // Get latest questionnaire for this JD
    const { data: latestQ } = await sb
      .from('questionnaires')
      .select('id, status, created_at')
      .eq('jd_history_id', jd.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // If there's a pending (unanswered) questionnaire, no reminder needed
    if (latestQ?.status === 'pending') continue

    // Get latest answer for this questionnaire
    const { data: latestAns } = await sb
      .from('questionnaire_answers')
      .select('submitted_at')
      .eq('questionnaire_id', latestQ?.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestAns?.submitted_at) continue

    const age = Date.now() - new Date(latestAns.submitted_at).getTime()
    if (age >= THIRTY_DAYS_MS) {
      reminders.push({ jd_history_id: jd.id, job_title: jd.job_title })
    }
  }

  return NextResponse.json({ reminders })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reminders/route.ts
git commit -m "feat: add GET /api/reminders endpoint for 30-day follow-up"
```

---

### Task 4: API — POST /api/questionnaire/resend

**Files:**
- Create: `src/app/api/questionnaire/resend/route.ts`

Takes `jd_history_id`. Finds the latest answered questionnaire for that JD, uses its submitted answers as `prefilled_answers` in a new questionnaire. Sets `is_resend: true`.

- [ ] **Step 1: Create route file**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jd_history_id } = await req.json() as { jd_history_id: string }
  if (!jd_history_id) return NextResponse.json({ error: 'Missing jd_history_id' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabase() as any

  // Verify ownership
  const { data: jd } = await sb
    .from('jd_history')
    .select('id')
    .eq('id', jd_history_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!jd) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get latest questionnaire for this JD
  const { data: latestQ } = await sb
    .from('questionnaires')
    .select('id, questions, language')
    .eq('jd_history_id', jd_history_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestQ) return NextResponse.json({ error: 'No questionnaire found' }, { status: 404 })

  // Get latest submitted answers
  const { data: latestAns } = await sb
    .from('questionnaire_answers')
    .select('answers')
    .eq('questionnaire_id', latestQ.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const prefilled = latestAns?.answers ?? {}

  // Create new questionnaire with previous answers as prefill, is_resend = true
  const { data: newQ, error } = await sb
    .from('questionnaires')
    .insert({
      jd_history_id,
      questions: latestQ.questions,
      prefilled_answers: prefilled,
      language: latestQ.language ?? 'vi',
      is_resend: true,
    })
    .select('id, token')
    .maybeSingle()

  if (error || !newQ) {
    console.error('Resend questionnaire error:', error)
    return NextResponse.json({ error: 'Lỗi tạo bảng hỏi mới' }, { status: 500 })
  }

  return NextResponse.json({ id: newQ.id, token: newQ.token, jd_history_id })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/questionnaire/resend/route.ts
git commit -m "feat: add POST /api/questionnaire/resend endpoint"
```

---

### Task 5: Update history API + q/[token] route to expose new fields

**Files:**
- Modify: `src/app/api/history/route.ts`
- Modify: `src/app/api/q/[token]/route.ts`

- [ ] **Step 1: Add `status` to history select**

In `src/app/api/history/route.ts`, change the select line from:
```typescript
    .select('id, job_title, created_at, user_id')
```
to:
```typescript
    .select('id, job_title, created_at, user_id, status')
```

- [ ] **Step 2: Expose `is_resend` from q/[token] route**

In `src/app/api/q/[token]/route.ts`, change the select from:
```typescript
    .select('id, questions, prefilled_answers, status, expires_at, language')
```
to:
```typescript
    .select('id, questions, prefilled_answers, status, expires_at, language, is_resend')
```

And update the return statement:
```typescript
  return NextResponse.json({
    id: data.id,
    questions: data.questions,
    prefilled_answers: data.prefilled_answers,
    language: (data.language ?? 'vi') as 'vi' | 'en',
    is_resend: data.is_resend ?? false,
  })
```

- [ ] **Step 3: Update the history type in app/page.tsx**

In `src/app/app/page.tsx`, update the `history` state type from:
```typescript
  const [history, setHistory] = useState<Pick<JdHistory, 'id' | 'job_title' | 'created_at'>[]>([])
```
to:
```typescript
  const [history, setHistory] = useState<Pick<JdHistory, 'id' | 'job_title' | 'created_at' | 'status'>[]>([])
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/history/route.ts src/app/api/q/[token]/route.ts src/app/app/page.tsx
git commit -m "feat: expose status in history API and is_resend in questionnaire token API"
```

---

### Task 6: QuestionnaireWizard — resend prefill banner

**Files:**
- Modify: `src/components/QuestionnaireWizard.tsx`
- Modify: `src/app/q/[token]/page.tsx`

- [ ] **Step 1: Add `isResend` prop to QuestionnaireWizard**

In `src/components/QuestionnaireWizard.tsx`, update the `Props` type:
```typescript
type Props = {
  questionnaireId: string
  token: string
  questions: Question[]
  prefilledAnswers: Record<string, unknown>
  language?: 'vi' | 'en'
  isResend?: boolean
}
```

Update the destructure in the component function signature:
```typescript
export default function QuestionnaireWizard({
  token,
  questions,
  prefilledAnswers,
  language = 'vi',
  isResend = false,
}: Props) {
```

- [ ] **Step 2: Add resend banner to the wizard UI**

In `QuestionnaireWizard.tsx`, find the section that renders the amber hint banner (the `amberHint` text). Add the resend banner **above** it. The amber hint is rendered inside the wizard pages — find where `t.amberHint` is used and add above it:

```tsx
{isResend && (
  <div className="mb-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
    {language === 'vi'
      ? 'Bảng hỏi này đã được điền sẵn từ lần trước — vui lòng xem lại và cập nhật nếu có thay đổi.'
      : 'This questionnaire is pre-filled from your previous submission — please review and update anything that has changed.'}
  </div>
)}
```

- [ ] **Step 3: Pass isResend from q/[token]/page.tsx**

In `src/app/q/[token]/page.tsx`, update the fetch response type and pass the prop:

```typescript
  const data = await res.json() as {
    id: string
    questions: Question[]
    prefilled_answers: Record<string, unknown>
    language: 'vi' | 'en'
    is_resend: boolean
  }

  return (
    <QuestionnaireWizard
      questionnaireId={data.id}
      token={token}
      questions={data.questions}
      prefilledAnswers={data.prefilled_answers}
      language={data.language ?? 'vi'}
      isResend={data.is_resend ?? false}
    />
  )
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/QuestionnaireWizard.tsx src/app/q/[token]/page.tsx
git commit -m "feat: show resend prefill banner in QuestionnaireWizard"
```

---

### Task 7: app/page.tsx — reminder banners + history split + resend button

**Files:**
- Modify: `src/app/app/page.tsx`

This task adds three UI features to the recruiter app page.

- [ ] **Step 1: Add reminders state and fetch on load**

In `src/app/app/page.tsx`, after the existing `useState` declarations, add:
```typescript
  const [reminders, setReminders] = useState<{ jd_history_id: string; job_title: string }[]>([])
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set())
  const [resendingFor, setResendingFor] = useState<string | null>(null)
```

Add a fetch for reminders inside `useEffect` that runs on mount (after the existing `fetchHistory` useEffect):
```typescript
  useEffect(() => {
    fetch('/api/reminders')
      .then((r) => r.json())
      .then((d) => { if (d.reminders) setReminders(d.reminders) })
      .catch(() => {})
  }, [])
```

- [ ] **Step 2: Add handleMarkHired function**

After `handleCreateQuestionnaire`, add:
```typescript
  async function handleMarkHired(jdHistoryId: string) {
    await fetch(`/api/jd-history/${jdHistoryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'hired' }),
    })
    setDismissedReminders((prev) => new Set([...prev, jdHistoryId]))
    setHistory((prev) => prev.map((h) => h.id === jdHistoryId ? { ...h, status: 'hired' as const } : h))
  }
```

- [ ] **Step 3: Add handleResendQuestionnaire function**

After `handleMarkHired`, add:
```typescript
  async function handleResendQuestionnaire(jdHistoryId: string) {
    setResendingFor(jdHistoryId)
    try {
      const res = await fetch('/api/questionnaire/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_history_id: jdHistoryId }),
      })
      const data = await res.json() as { token?: string; id?: string; jd_history_id?: string; error?: string }
      if (data.token) {
        setQuestionnaireToken(data.token)
        setQuestionnaireId(data.id ?? null)
        setActiveJdHistoryId(jdHistoryId)
        setAnswersData(null)
        setDismissedReminders((prev) => new Set([...prev, jdHistoryId]))
        fetchHistory()
      } else {
        alert('Có lỗi khi tạo bảng hỏi mới: ' + (data.error ?? ''))
      }
    } catch {
      alert('Không kết nối được, thử lại nhé!')
    } finally {
      setResendingFor(null)
    }
  }
```

- [ ] **Step 4: Render reminder banners**

In the JSX, after the existing `showAnswersReadyToast` banner and before the `<header>`, add reminder banners. Replace:
```tsx
      {/* Answers ready banner */}
      {showAnswersReadyToast && (
```
with:
```tsx
      {/* 30-day reminder banners */}
      {reminders
        .filter((r) => !dismissedReminders.has(r.jd_history_id))
        .map((r) => (
          <div key={r.jd_history_id} className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
            <div className="bg-white border border-amber-300 rounded-xl shadow-lg px-4 py-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800">
                  <span className="text-amber-500 mr-1">⏰</span>
                  <span className="font-bold">{r.job_title}</span> — đã 1 tháng rồi, tuyển được chưa?
                </p>
                <button
                  onClick={() => setDismissedReminders((prev) => new Set([...prev, r.jd_history_id]))}
                  className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleMarkHired(r.jd_history_id)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                >
                  ✓ Đã tuyển xong
                </button>
                <button
                  onClick={() => handleResendQuestionnaire(r.jd_history_id)}
                  disabled={resendingFor === r.jd_history_id}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {resendingFor === r.jd_history_id ? 'Đang tạo...' : '↻ Gửi bảng hỏi mới'}
                </button>
              </div>
            </div>
          </div>
        ))}

      {/* Answers ready banner */}
      {showAnswersReadyToast && (
```

- [ ] **Step 5: Split history panel into active / hired**

In the history dropdown section (around line 260), replace the existing single list with a split view:

Find:
```tsx
            <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">Chưa có JD nào</p>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="flex items-center border-b border-gray-50 last:border-0">
                    <button
                      onClick={() => handleHistoryClick(item.id)}
                      className="flex-1 text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
                    >
                      <p className="font-medium text-sm text-gray-800 truncate">{item.job_title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                    </button>
                    <button
                      onClick={() => { setPostingJdId(item.id); setShowHistory(false) }}
                      className="px-3 py-1 mr-3 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 whitespace-nowrap"
                    >
                      Đăng tuyển
                    </button>
                  </div>
                ))
              )}
            </div>
```

Replace with:
```tsx
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {history.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">Chưa có JD nào</p>
              ) : (
                <>
                  {/* Active JDs */}
                  {history.filter((h) => (h.status ?? 'active') === 'active').map((item) => (
                    <div key={item.id} className="flex items-center border-b border-gray-50 last:border-0">
                      <button
                        onClick={() => handleHistoryClick(item.id)}
                        className="flex-1 text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
                      >
                        <p className="font-medium text-sm text-gray-800 truncate">{item.job_title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                      </button>
                      <button
                        onClick={() => { handleResendQuestionnaire(item.id); setShowHistory(false) }}
                        disabled={resendingFor === item.id}
                        className="px-2 py-1 mr-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 whitespace-nowrap disabled:opacity-50"
                      >
                        {resendingFor === item.id ? '...' : '↻'}
                      </button>
                      <button
                        onClick={() => { setPostingJdId(item.id); setShowHistory(false) }}
                        className="px-3 py-1 mr-3 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 whitespace-nowrap"
                      >
                        Đăng tuyển
                      </button>
                    </div>
                  ))}

                  {/* Hired JDs */}
                  {history.filter((h) => h.status === 'hired').length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Đã tuyển xong</p>
                      </div>
                      {history.filter((h) => h.status === 'hired').map((item) => (
                        <div key={item.id} className="flex items-center opacity-60">
                          <button
                            onClick={() => handleHistoryClick(item.id)}
                            className="flex-1 text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                          >
                            <p className="font-medium text-sm text-gray-800 truncate">{item.job_title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                          </button>
                          <span className="px-3 mr-3 text-xs text-green-600 font-medium">✓ Hired</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/app/page.tsx
git commit -m "feat: add reminder banners, hired status, and resend questionnaire to recruiter app"
```

---

## Self-Review

**Spec coverage:**
- ✅ Re-send questionnaire: Tasks 4 + 7 (resend API + UI button)
- ✅ Pre-fill from previous answers with banner: Tasks 4 + 6
- ✅ 30-day in-app reminder: Tasks 3 + 7 (reminders API + banners)
- ✅ "Đã tuyển xong" action: Tasks 2 + 7
- ✅ History split active/hired: Task 7 Step 5
- ✅ DB changes: Task 1

**No placeholders found.**

**Type consistency:** `status: 'active' | 'hired'` used consistently across Task 1 (type), Task 2 (API), Task 7 (UI). `is_resend: boolean` used consistently across Tasks 1, 4, 5, 6. `jd_history_id` string used consistently across Tasks 3, 4, 7.
