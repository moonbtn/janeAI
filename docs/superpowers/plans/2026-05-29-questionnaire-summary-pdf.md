# Questionnaire Summary & PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JD refinement flow with an inline answers summary panel + PDF export, auto-notifying recruiters when the HM submits.

**Architecture:** New `GET /api/questionnaire/[id]/summary` endpoint serves data to a new `QuestionnaireSummary` client component in the main app. A separate print page at `/q/[token]/summary` serves the print-ready view (token-based, no auth). Auto-poll replaces the manual "Kiểm tra" button.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Supabase, Clerk auth, browser `window.print()` for PDF.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| CREATE | `src/app/api/questionnaire/[id]/summary/route.ts` | GET summary — auth-protected, returns questions + answers + metadata |
| CREATE | `src/components/QuestionnaireSummary.tsx` | Inline answers panel with PDF + post buttons |
| CREATE | `src/app/q/[token]/summary/page.tsx` | Print-ready standalone page (token auth) |
| CREATE | `src/app/q/[token]/summary/PrintTrigger.tsx` | Client component that auto-calls window.print() |
| MODIFY | `src/app/app/page.tsx` | Remove refinement, add auto-poll, wire summary panel |
| DELETE | `src/app/api/questionnaire/[id]/refine-jd/route.ts` | No longer needed |

---

## Task 1: Summary API Endpoint

**Files:**
- Create: `src/app/api/questionnaire/[id]/summary/route.ts`

- [ ] **Create the route file with this exact content:**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabase } from '@/lib/supabase'
import type { Question } from '@/lib/supabase'

export type QuestionnaireSummaryData = {
  jobTitle: string
  submittedAt: string
  questions: Question[]
  answers: Record<string, unknown>
  token: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: q, error: qError } = await (getSupabase() as any)
    .from('questionnaires')
    .select('id, questions, token, jd_history_id')
    .eq('id', id)
    .single()

  if (qError || !q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jd } = await (getSupabase() as any)
    .from('jd_history')
    .select('job_title')
    .eq('id', q.jd_history_id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ans } = await (getSupabase() as any)
    .from('questionnaire_answers')
    .select('answers, submitted_at')
    .eq('questionnaire_id', id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  if (!ans) return NextResponse.json({ error: 'No answers yet' }, { status: 404 })

  return NextResponse.json({
    jobTitle: jd?.job_title ?? 'Không rõ vị trí',
    submittedAt: ans.submitted_at,
    questions: q.questions,
    answers: ans.answers,
    token: q.token,
  } satisfies QuestionnaireSummaryData)
}
```

- [ ] **Verify TypeScript compiles cleanly:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Commit:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add src/app/api/questionnaire/[id]/summary/route.ts && git commit -m "feat: add questionnaire summary API endpoint"
```

---

## Task 2: QuestionnaireSummary Component

**Files:**
- Create: `src/components/QuestionnaireSummary.tsx`

- [ ] **Create the component with this exact content:**

```tsx
'use client'

import type { Question } from '@/lib/supabase'

export type QuestionnaireSummaryData = {
  jobTitle: string
  submittedAt: string
  questions: Question[]
  answers: Record<string, unknown>
  token: string
}

type Props = {
  data: QuestionnaireSummaryData
  onPost: () => void
}

function formatSubmittedAt(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function renderAnswer(question: Question, answers: Record<string, unknown>): string {
  const value = answers[question.id]
  if (value == null) return '(chưa trả lời)'

  if (question.type === 'skill_matrix' && Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'object' && v !== null && 'skill' in v) {
          const s = v as { skill: string; level: string }
          return `${s.skill} [${s.level}]`
        }
        return String(v)
      })
      .join(' · ')
  }

  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

export default function QuestionnaireSummary({ data, onPost }: Props) {
  const { jobTitle, submittedAt, questions, answers, token } = data

  // Group questions by section
  const sections = questions.reduce<Record<number, { label: string; questions: Question[] }>>(
    (acc, q) => {
      if (!acc[q.section]) acc[q.section] = { label: q.sectionLabel, questions: [] }
      acc[q.section].questions.push(q)
      return acc
    },
    {}
  )

  function handlePdf() {
    const origin = window.location.origin
    window.open(`${origin}/q/${token}/summary`, '_blank')
  }

  return (
    <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
      {/* Header */}
      <div className="bg-green-50 px-5 py-4 border-b border-green-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-green-800">{jobTitle}</p>
            <p className="text-xs text-green-600 mt-0.5">
              Sếp đã điền lúc {formatSubmittedAt(submittedAt)}
            </p>
          </div>
          <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full shrink-0">
            ✓ Hoàn tất
          </span>
        </div>
      </div>

      {/* Answers by section */}
      <div className="px-5 py-4 space-y-5 max-h-[500px] overflow-y-auto">
        {Object.entries(sections)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([sectionNum, { label, questions: sqs }]) => (
            <div key={sectionNum}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                {label}
              </p>
              <div className="space-y-3">
                {sqs.map((q) => (
                  <div key={q.id} className="space-y-0.5">
                    <p className="text-xs font-medium text-gray-600">{q.text}</p>
                    <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-1.5 leading-relaxed">
                      {renderAnswer(q, answers)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Actions */}
      <div className="px-5 pb-5 pt-2 flex gap-2">
        <button
          onClick={handlePdf}
          className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
        >
          🖨 Tải PDF
        </button>
        <button
          onClick={onPost}
          className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Đăng tuyển ngay →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Verify TypeScript compiles cleanly:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Commit:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add src/components/QuestionnaireSummary.tsx && git commit -m "feat: add QuestionnaireSummary component"
```

---

## Task 3: Print Page

**Files:**
- Create: `src/app/q/[token]/summary/page.tsx`
- Create: `src/app/q/[token]/summary/PrintTrigger.tsx`

- [ ] **Create PrintTrigger client component:**

```tsx
// src/app/q/[token]/summary/PrintTrigger.tsx
'use client'

import { useEffect } from 'react'

export default function PrintTrigger() {
  useEffect(() => {
    // Small delay to let the page render fully before triggering print
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [])

  return null
}
```

- [ ] **Create the print page:**

```tsx
// src/app/q/[token]/summary/page.tsx
import { notFound } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import type { Question } from '@/lib/supabase'
import PrintTrigger from './PrintTrigger'

function formatSubmittedAt(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    weekday: 'long',
  })
}

function renderAnswer(question: Question, answers: Record<string, unknown>): string {
  const value = answers[question.id]
  if (value == null) return '(chưa trả lời)'

  if (question.type === 'skill_matrix' && Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'object' && v !== null && 'skill' in v) {
          const s = v as { skill: string; level: string }
          return `${s.skill} [${s.level}]`
        }
        return String(v)
      })
      .join(' · ')
  }

  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

export default async function SummaryPrintPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: q } = await (getSupabase() as any)
    .from('questionnaires')
    .select('id, questions, jd_history_id')
    .eq('token', token)
    .single()

  if (!q) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jd } = await (getSupabase() as any)
    .from('jd_history')
    .select('job_title')
    .eq('id', q.jd_history_id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ans } = await (getSupabase() as any)
    .from('questionnaire_answers')
    .select('answers, submitted_at')
    .eq('questionnaire_id', q.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single()

  if (!ans) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Sếp chưa điền bảng hỏi này.
      </div>
    )
  }

  const questions = q.questions as Question[]
  const answers = ans.answers as Record<string, unknown>
  const jobTitle = jd?.job_title ?? 'Không rõ vị trí'

  const sections = questions.reduce<Record<number, { label: string; questions: Question[] }>>(
    (acc, question) => {
      if (!acc[question.section]) {
        acc[question.section] = { label: question.sectionLabel, questions: [] }
      }
      acc[question.section].questions.push(question)
      return acc
    },
    {}
  )

  return (
    <>
      <PrintTrigger />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11pt; }
          .page-break { page-break-before: always; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      `}</style>

      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Print button — hidden when printing */}
        <div className="no-print flex justify-end mb-6">
          <button
            onClick={() => window.print()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            🖨 In / Lưu PDF
          </button>
        </div>

        {/* Document header */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Jane AI · Hiring Brief</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{jobTitle}</h1>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Submitted: {formatSubmittedAt(ans.submitted_at)}
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-7">
          {Object.entries(sections)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([sectionNum, { label, questions: sqs }]) => (
              <div key={sectionNum}>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-1 mb-3">
                  {label}
                </h2>
                <div className="space-y-4">
                  {sqs.map((question) => (
                    <div key={question.id}>
                      <p className="text-xs font-semibold text-gray-500 mb-1">{question.text}</p>
                      <p className="text-sm text-gray-800 leading-relaxed">
                        {renderAnswer(question, answers)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">Generated by Jane AI · jane-ai.app</p>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Verify TypeScript compiles cleanly:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Commit:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add src/app/q/[token]/summary/ && git commit -m "feat: add print-ready questionnaire summary page"
```

---

## Task 4: Update app/page.tsx — Remove Refinement + Wire Summary

**Files:**
- Modify: `src/app/app/page.tsx`

This task has two parts: (A) remove all refinement code, (B) add auto-poll + summary wiring.

### Part A: Remove refinement state, functions, and UI

- [ ] **Remove these state declarations** (find and delete each line):

```typescript
// DELETE these lines:
const [refinedJd, setRefinedJd] = useState('')
const [changes, setChanges] = useState<string[]>([])
const [refining, setRefining] = useState(false)
const [showRefinedToast, setShowRefinedToast] = useState(false)
```

- [ ] **Remove the `refinedJdRef`:**

```typescript
// DELETE this line:
const refinedJdRef = useRef<HTMLDivElement>(null)
```

- [ ] **Remove `handleRefineJd` and `handleConfirmRefinedJd` functions** (delete both entire functions).

- [ ] **In `handleCreateQuestionnaire`**, remove these lines (they reset state that no longer exists):

```typescript
// DELETE these two lines inside handleCreateQuestionnaire:
setRefinedJd('')
setChanges([])
```

- [ ] **In `handleHistoryClick`**, remove these lines:

```typescript
// DELETE these two lines inside handleHistoryClick:
setRefinedJd('')
setChanges([])
```

- [ ] **Remove the `showRefinedToast` toast JSX** — find and delete this entire block:

```tsx
{showRefinedToast && (
  <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg">
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
    <span className="text-sm font-semibold">JD đã tinh chỉnh xong! Xem bên dưới 👇</span>
  </div>
)}
```

- [ ] **Remove the refined JD display block** — find and delete the entire `{refinedJd && (...)}` JSX section.

- [ ] **Replace the answers check section** — find this block:

```tsx
{!answers ? (
  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
    <button
      onClick={handleCheckAnswers}
      disabled={checking}
      className="w-full border border-indigo-200 text-indigo-600 rounded-xl py-2.5 text-sm hover:bg-indigo-50 transition-colors disabled:opacity-60"
    >
      {checking ? 'Đang kiểm tra...' : 'Kiểm tra sếp đã điền chưa'}
    </button>
    {notAnsweredYet && (
      <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg py-1.5">
        Sếp chưa điền, gửi link nhắc sếp nhé 😅
      </p>
    )}
  </div>
) : (
  <div className="bg-white rounded-xl border border-green-200 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
        <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-green-800">Sếp đã điền xong!</p>
    </div>
    <button
      onClick={handleRefineJd}
      disabled={refining}
      className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
    >
      {refining ? (
        <>
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tinh chỉnh... (~15s)
        </>
      ) : '✦ Tinh chỉnh JD từ câu trả lời'}
    </button>
  </div>
)}
```

Replace with just a waiting message (summary will be shown outside the questionnaire card):

```tsx
{!answersData && (
  <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
    <p className="text-xs text-gray-400 text-center">
      Đang chờ sếp điền bảng hỏi... (Jane sẽ tự báo khi sếp xong)
    </p>
  </div>
)}
```

### Part B: Add new state, auto-poll, banner, and summary wiring

- [ ] **Add new imports at the top of the file** (after existing imports):

```typescript
import QuestionnaireSummary from '@/components/QuestionnaireSummary'
import type { QuestionnaireSummaryData } from '@/components/QuestionnaireSummary'
```

- [ ] **Add new state declarations** (after the `showAnswersReadyToast` state added in the earlier partial implementation — if that line already exists, add only the `answersData` line):

```typescript
const [answersData, setAnswersData] = useState<QuestionnaireSummaryData | null>(null)
const [showAnswersReadyToast, setShowAnswersReadyToast] = useState(false)
```

Note: if `showAnswersReadyToast` was already added, add only `answersData`.

- [ ] **Replace (or add) the auto-poll `useEffect`** — add this after the existing OAuth cleanup useEffect:

```typescript
// Auto-poll: notify recruiter when HM submits answers
useEffect(() => {
  if (!questionnaireId || answersData) return

  async function checkAnswers() {
    try {
      const res = await fetch(`/api/questionnaire/${questionnaireId}/summary`)
      if (res.ok) {
        const data = await res.json() as QuestionnaireSummaryData
        setAnswersData(data)
        setShowAnswersReadyToast(true)
        setTimeout(() => setShowAnswersReadyToast(false), 8000)
      }
    } catch {
      // silent — don't interrupt the recruiter
    }
  }

  // Check immediately on mount, then every 30s
  checkAnswers()
  const interval = setInterval(checkAnswers, 30000)
  return () => clearInterval(interval)
}, [questionnaireId, answersData])
```

- [ ] **Reset `answersData` in `handleCreateQuestionnaire`** — inside the function, after `setAnswers(null)`, add:

```typescript
setAnswersData(null)
```

- [ ] **Reset `answersData` in `handleHistoryClick`** — inside the function, after `setAnswers(null)`, add:

```typescript
setAnswersData(null)
```

- [ ] **Add the answers-ready toast JSX** — add this toast after/near the existing toasts section (after the `showRefinedToast` toast was deleted, add this):

```tsx
{/* Answers ready banner */}
{showAnswersReadyToast && (
  <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg animate-pulse">
    <span className="text-lg">🎉</span>
    <span className="text-sm font-semibold">Sếp vừa điền xong! Xem answers bên dưới ↓</span>
  </div>
)}
```

- [ ] **Add `QuestionnaireSummary` to the JSX** — find the PostingCard block:

```tsx
{/* Posting Card */}
{postingJdId && (
  <PostingCard jdHistoryId={postingJdId} />
)}
```

And add the summary panel just BEFORE it:

```tsx
{/* Questionnaire Summary */}
{answersData && !postingJdId && (
  <div className="max-w-2xl mx-auto px-4 pb-4">
    <QuestionnaireSummary
      data={answersData}
      onPost={() => { if (activeJdHistoryId) setPostingJdId(activeJdHistoryId) }}
    />
  </div>
)}

{/* Posting Card */}
{postingJdId && (
  <PostingCard jdHistoryId={postingJdId} />
)}
```

- [ ] **Remove `handleCheckAnswers` function and `checking`/`notAnsweredYet` state** if they are no longer referenced anywhere in the file after the above changes. Check with:

```bash
grep -n "handleCheckAnswers\|notAnsweredYet\|checking\b" "/Users/Macbook/Claude Code/jane-ai/src/app/app/page.tsx"
```

If not referenced, delete those lines.

- [ ] **Verify TypeScript compiles cleanly:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Commit:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add src/app/app/page.tsx && git commit -m "feat: replace JD refinement with answers summary panel and auto-poll"
```

---

## Task 5: Delete refine-jd Route

**Files:**
- Delete: `src/app/api/questionnaire/[id]/refine-jd/route.ts`

- [ ] **Delete the file:**

```bash
rm "/Users/Macbook/Claude Code/jane-ai/src/app/api/questionnaire/[id]/refine-jd/route.ts"
```

- [ ] **Verify TypeScript still compiles cleanly:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Commit:**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add -A && git commit -m "chore: remove unused refine-jd API route"
```

---

## Task 6: Smoke Test End-to-End

- [ ] **Confirm dev server is running on port 3000:**

```bash
lsof -i :3000 | grep LISTEN || echo "Server not running"
```

If not running:
```bash
cd "/Users/Macbook/Claude Code/jane-ai" && unset ANTHROPIC_API_KEY && npm run dev > /tmp/jane-dev.log 2>&1 &
sleep 6 && tail -5 /tmp/jane-dev.log
```

- [ ] **Verify the summary API route exists:**

```bash
curl -s http://localhost:3000/api/questionnaire/nonexistent-id/summary | python3 -m json.tool
```
Expected: `{"error": "Unauthorized"}` (auth is working — route exists).

- [ ] **Verify the print page route exists:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/q/nonexistent-token/summary
```
Expected: `404` (route exists, token not found).

- [ ] **Manual test in browser** (open http://localhost:3000/app):
  1. Paste a JD → create questionnaire → copy the link
  2. Open the link in a new tab → fill all questions → submit
  3. Back in the main tab: within 30 seconds, green banner "🎉 Sếp vừa điền xong!" should appear
  4. `QuestionnaireSummary` card should expand below with all answers
  5. Click "🖨 Tải PDF" → new tab opens at `/q/[token]/summary` → print dialog appears
  6. Click "Đăng tuyển ngay →" → `PostingCard` appears

- [ ] **Commit final state if any fixes were needed.**
