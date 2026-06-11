# Lead Form Phone Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead form trong RecruitingChatPanel thu số điện thoại (bắt buộc) thay vì bắt gõ lại email; email prefill từ Clerk; `hiringNeed` lấy từ tin nhắn user gần nhất.

**Architecture:** Validation phone nằm ở server trong `normalizeLeadPayload` (pattern `LeadValidationError` có sẵn — route tự trả 400 kèm lý do). UI chỉ thêm field + prefill. DB thêm 1 cột nullable `phone` qua migration mới.

**Tech Stack:** Next.js 16 App Router, Clerk (`useUser`), Supabase (service role), node:test + tsx cho unit tests.

**Spec:** `docs/superpowers/specs/2026-06-11-lead-form-phone-design.md`

---

### Task 1: Phone validation trong normalizeLeadPayload (TDD)

**Files:**
- Modify: `tests/recruiting-api.test.ts` (describe 'recruiting lead normalization', ~line 76-115)
- Modify: `src/lib/recruiting-rag/persistence.ts` (~line 63-110)

- [ ] **Step 1: Sửa test cũ + viết test mới (failing)**

Trong `tests/recruiting-api.test.ts`, describe `'recruiting lead normalization'`:

(a) Test `'trims valid lead details and normalizes empty optionals'` — thêm `phone: '091 234-5678'` vào input và `phone: '0912345678'` vào expected:

```typescript
  it('trims valid lead details and normalizes empty optionals', () => {
    assert.deepEqual(
      normalizeLeadPayload({
        email: ' employer@example.com ',
        phone: '091 234-5678',
        name: ' Jane ',
        company: '',
        hiringNeed: ' Tuyển Data Scientist ',
        conversationId: 'conversation-1',
      }),
      {
        email: 'employer@example.com',
        phone: '0912345678',
        name: 'Jane',
        company: null,
        hiringNeed: 'Tuyển Data Scientist',
        conversationId: 'conversation-1',
      }
    )
  })
```

(b) Test `'throws LeadValidationError so the API can tell client mistakes from server failures'` — thêm `phone: '0912345678'` vào 2 case name/company để chúng fail đúng field đang test:

```typescript
  it('throws LeadValidationError so the API can tell client mistakes from server failures', () => {
    const isValidationError = (error: unknown) => error instanceof LeadValidationError
    assert.throws(() => normalizeLeadPayload({ email: 'not-an-email' }), isValidationError)
    assert.throws(
      () => normalizeLeadPayload({ email: 'a@b.co', phone: '0912345678', name: 'x'.repeat(121) }),
      isValidationError
    )
    assert.throws(
      () => normalizeLeadPayload({ email: 'a@b.co', phone: '0912345678', company: 42 }),
      isValidationError
    )
  })
```

(c) Thêm 3 test mới ngay sau đó (vẫn trong describe này):

```typescript
  it('normalizes Vietnamese phone numbers and strips separators', () => {
    assert.equal(
      normalizeLeadPayload({ email: 'a@b.co', phone: '091 234-5678' }).phone,
      '0912345678'
    )
    assert.equal(
      normalizeLeadPayload({ email: 'a@b.co', phone: '(024) 3825.1234' }).phone,
      '02438251234'
    )
  })

  it('accepts international phone format with leading +', () => {
    assert.equal(
      normalizeLeadPayload({ email: 'a@b.co', phone: '+84 91 234 5678' }).phone,
      '+84912345678'
    )
  })

  it('rejects missing or malformed phone numbers with LeadValidationError', () => {
    const isValidationError = (error: unknown) => error instanceof LeadValidationError
    assert.throws(() => normalizeLeadPayload({ email: 'a@b.co' }), isValidationError)
    assert.throws(() => normalizeLeadPayload({ email: 'a@b.co', phone: '12345' }), isValidationError)
    assert.throws(() => normalizeLeadPayload({ email: 'a@b.co', phone: 'gọi em nhé' }), isValidationError)
    assert.throws(() => normalizeLeadPayload({ email: 'a@b.co', phone: 42 }), isValidationError)
  })
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd "/Users/Macbook/Claude Code/jane-ai" && node --import tsx --test tests/recruiting-api.test.ts 2>&1 | grep -E "ℹ (pass|fail)"`
Expected: `fail` ≥ 3 (test cũ (a) fail vì thiếu key `phone` trong kết quả; 3 test mới fail). Nếu pass hết → test viết sai, dừng lại kiểm tra.

- [ ] **Step 3: Implement trong persistence.ts**

Trong `src/lib/recruiting-rag/persistence.ts`:

(a) `LeadInput` thêm `phone?: unknown`:

```typescript
type LeadInput = {
  email?: unknown
  phone?: unknown
  name?: unknown
  company?: unknown
  hiringNeed?: unknown
  conversationId?: unknown
}
```

(b) `NormalizedLeadPayload` thêm `phone: string`:

```typescript
export type NormalizedLeadPayload = {
  email: string
  phone: string
  name: string | null
  company: string | null
  hiringNeed: string | null
  conversationId: string | null
}
```

(c) Thêm `normalizePhone` ngay dưới `nullableTrimmed` (cố tình thoáng — thà nhận số lạ còn hơn mất lead):

```typescript
function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LeadValidationError('Please enter a phone number')
  }
  const cleaned = value.replace(/[\s().-]/g, '')
  if (!/^(0\d{9,10}|\+\d{10,12})$/.test(cleaned)) {
    throw new LeadValidationError('Please enter a valid phone number')
  }
  return cleaned
}
```

(d) `normalizeLeadPayload` trả thêm `phone` (sau `email`):

```typescript
  return {
    email,
    phone: normalizePhone(payload.phone),
    name: nullableTrimmed(payload.name, 120, 'name'),
    company: nullableTrimmed(payload.company, 120, 'company'),
    hiringNeed: nullableTrimmed(payload.hiringNeed, 2000, 'hiringNeed'),
    conversationId: nullableTrimmed(payload.conversationId, 120, 'conversationId'),
  }
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd "/Users/Macbook/Claude Code/jane-ai" && node --import tsx --test tests/recruiting-api.test.ts 2>&1 | grep -E "ℹ (pass|fail)"`
Expected: `pass 14`, `fail 0`

- [ ] **Step 5: Commit**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add tests/recruiting-api.test.ts src/lib/recruiting-rag/persistence.ts && git commit -m "feat: require and normalize phone in lead payload

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Lưu phone vào DB + migration

**Files:**
- Modify: `src/lib/recruiting-rag/db.ts` (saveRecruitingLead, ~line 76-94)
- Create: `supabase/migrations/20260611100000_add_recruiting_leads_phone.sql`

- [ ] **Step 1: Thêm phone vào insert trong db.ts**

Trong `saveRecruitingLead`, object `.insert({...})` thêm dòng `phone: payload.phone,` ngay sau `email: payload.email,`:

```typescript
    .insert({
      user_id: userId,
      conversation_id: payload.conversationId,
      email: payload.email,
      phone: payload.phone,
      name: payload.name,
      company: payload.company,
      hiring_need: payload.hiringNeed,
      metadata: {
        source: 'recruiting_chatbot',
        capturedAt: new Date().toISOString(),
      },
    })
```

- [ ] **Step 2: Tạo migration**

File `supabase/migrations/20260611100000_add_recruiting_leads_phone.sql`:

```sql
-- Lead follow-up is phone-first now; email prefills from Clerk.
-- Nullable so existing email-only leads stay valid.
alter table public.recruiting_leads add column if not exists phone text;
```

- [ ] **Step 3: Typecheck**

Run: `cd "/Users/Macbook/Claude Code/jane-ai" && npx tsc --noEmit && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add src/lib/recruiting-rag/db.ts supabase/migrations/20260611100000_add_recruiting_leads_phone.sql && git commit -m "feat: persist lead phone + add recruiting_leads.phone migration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: UI — ô phone, email prefill từ Clerk, hiringNeed từ tin nhắn gần nhất

**Files:**
- Modify: `src/components/RecruitingChatPanel.tsx` (imports ~line 1-6, state ~line 85-92, handleLeadSubmit ~line 128-148, JSX form ~line 270-310)

- [ ] **Step 1: Imports + state + prefill**

(a) Đổi import react (line 3) và thêm Clerk:

```typescript
import { useEffect, useMemo, useState } from 'react'
import { useUser } from '@clerk/nextjs'
```

(b) Trong component, thêm state `leadPhone` cạnh `leadEmail` (line ~89):

```typescript
  const [leadPhone, setLeadPhone] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
```

(c) Prefill email từ Clerk — đặt ngay sau các useState, trước `transport`:

```typescript
  const { user } = useUser()
  const clerkEmail = user?.emailAddresses?.[0]?.emailAddress ?? ''
  useEffect(() => {
    if (clerkEmail) setLeadEmail((current) => current || clerkEmail)
  }, [clerkEmail])
```

- [ ] **Step 2: handleLeadSubmit — gate theo phone, gửi phone, hiringNeed từ messages**

Thay toàn bộ hàm (line ~128-148):

```typescript
  async function handleLeadSubmit() {
    if (!leadPhone.trim() || leadStatus === 'sending') return
    setLeadStatus('sending')
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
    try {
      const res = await fetch('/api/recruiting-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: leadPhone,
          email: leadEmail,
          name: leadName,
          company: leadCompany,
          hiringNeed: lastUserMessage ? textFromMessage(lastUserMessage) : null,
          conversationId,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setLeadStatus('sent')
    } catch {
      setLeadStatus('error')
    }
  }
```

- [ ] **Step 3: JSX form — phone lên đầu, email xuống dưới**

Thay input email (line ~275-281) bằng cặp phone + email:

```tsx
                <input
                  type="tel"
                  value={leadPhone}
                  onChange={(event) => setLeadPhone(event.target.value)}
                  placeholder="Số điện thoại (09xx xxx xxx)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="email"
                  value={leadEmail}
                  onChange={(event) => setLeadEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
```

Và nút submit (line ~301) đổi điều kiện disable:

```tsx
                    disabled={!leadPhone.trim() || leadStatus === 'sending'}
```

- [ ] **Step 4: Full test + typecheck + lint**

Run: `cd "/Users/Macbook/Claude Code/jane-ai" && npm run test:unit 2>&1 | grep -E "ℹ (tests|pass|fail)" && npx tsc --noEmit && npx eslint src/components/RecruitingChatPanel.tsx && echo ALL-OK`
Expected: `pass 39`, `fail 0`, `ALL-OK`

- [ ] **Step 5: Commit**

```bash
cd "/Users/Macbook/Claude Code/jane-ai" && git add src/components/RecruitingChatPanel.tsx && git commit -m "feat: lead form collects phone, prefills email from Clerk

hiringNeed now comes from the latest sent user message instead of the
in-flight chat input (which was usually empty or half-typed).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Verify + chuẩn bị deploy

- [ ] **Step 1: Toàn bộ suite lần cuối**

Run: `cd "/Users/Macbook/Claude Code/jane-ai" && npm run test:unit 2>&1 | grep -E "ℹ (tests|pass|fail)" && npx tsc --noEmit && echo OK`
Expected: `pass 39`, `fail 0`, `OK`

- [ ] **Step 2: Nhắc việc ngoài code (không tự làm)**

Báo user 2 việc cần quyền prod:
1. Apply migration `20260611100000_add_recruiting_leads_phone.sql` lên Supabase prod (cùng 2 migration 2026-06-09 nếu chưa apply — xem spec).
2. Deploy qua skill `deploy-jane-ai` khi user yêu cầu. Lưu ý: nếu deploy TRƯỚC khi apply migration, lead submit sẽ 500 (cột phone chưa tồn tại) — apply migration trước, deploy sau.
