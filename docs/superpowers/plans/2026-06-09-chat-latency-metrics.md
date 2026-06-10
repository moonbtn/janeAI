# Chat Latency Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store per-turn chat latency metrics in Supabase without delaying the visible chat response.

**Architecture:** Add a separate Supabase metrics table keyed to conversations and optional assistant messages. Collect timings in `/api/recruiting-chat` with `performance.now()`, stream the model response as normal, then write metrics inside `onFinish` with safe error handling so telemetry failures never block chat.

**Tech Stack:** Next.js App Router route handler, Vercel AI SDK streaming, Supabase Postgres, `@supabase/supabase-js`, Node test runner with `tsx`.

---

## File Structure

- Create migration: `supabase/migrations/<timestamp>_add_recruiting_chat_turn_metrics.sql`
  - Adds `public.recruiting_chat_turn_metrics`.
  - Enables RLS.
  - Grants access only to `service_role`.
  - Adds indexes for conversation and created time.
- Modify: `src/lib/recruiting-rag/persistence.ts`
  - Add a `RecruitingChatTurnMetricsInsert` type.
  - Add `buildTurnMetricsInsertPayload()` to normalize metric rows.
- Modify: `src/lib/recruiting-rag/db.ts`
  - Add `saveRecruitingChatTurnMetrics()` with the same safe Supabase style as existing message/lead writes.
- Modify: `src/app/api/recruiting-chat/route.ts`
  - Add local timing capture for auth/request parsing/RAG/prompt/model lifecycle.
  - Write metrics only from `onFinish` and `onError`.
- Modify: `tests/recruiting-api.test.ts`
  - Add payload tests for the metrics insert builder.
- Optional later: add admin display once enough data exists. Do not include it in this implementation.

---

### Task 1: Add Supabase Metrics Table

**Files:**
- Create: `supabase/migrations/<timestamp>_add_recruiting_chat_turn_metrics.sql`

- [ ] **Step 1: Create the migration file**

Run:

```bash
supabase migration new add_recruiting_chat_turn_metrics
```

Expected: Supabase creates a new SQL file in `supabase/migrations/`.

- [ ] **Step 2: Add the migration SQL**

Put this SQL in the generated migration file:

```sql
-- Non-blocking per-turn metrics for the recruiting chat.
-- Written by Next.js server routes with SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.recruiting_chat_turn_metrics (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.recruiting_chat_conversations(id) on delete cascade,
  assistant_message_id uuid references public.recruiting_chat_messages(id) on delete set null,
  user_id text not null,
  user_email text,
  provider text not null,
  model text not null,
  status text not null check (status in ('completed', 'error')),
  error_message text,
  auth_ms integer,
  request_parse_ms integer,
  persistence_ms integer,
  rag_ms integer,
  prompt_chars integer not null default 0,
  retrieved_context_chars integer not null default 0,
  retrieved_chunk_count integer not null default 0,
  first_token_ms integer,
  total_ms integer not null,
  created_at timestamptz not null default now()
);

alter table public.recruiting_chat_turn_metrics enable row level security;

revoke all on table public.recruiting_chat_turn_metrics from anon, authenticated;

grant select, insert, update, delete on table public.recruiting_chat_turn_metrics to service_role;

create index if not exists idx_recruiting_chat_turn_metrics_conversation_created
  on public.recruiting_chat_turn_metrics(conversation_id, created_at desc);

create index if not exists idx_recruiting_chat_turn_metrics_user_created
  on public.recruiting_chat_turn_metrics(user_id, created_at desc);

create index if not exists idx_recruiting_chat_turn_metrics_status_created
  on public.recruiting_chat_turn_metrics(status, created_at desc);
```

- [ ] **Step 3: Verify migration shape locally**

Run:

```bash
rg -n "recruiting_chat_turn_metrics|enable row level security|service_role" supabase/migrations
```

Expected: the new migration contains the table, RLS, grants, and indexes.

---

### Task 2: Add Metrics Payload Builder

**Files:**
- Modify: `src/lib/recruiting-rag/persistence.ts`
- Modify test: `tests/recruiting-api.test.ts`

- [ ] **Step 1: Read existing persistence helpers**

Run:

```bash
sed -n '1,260p' src/lib/recruiting-rag/persistence.ts
sed -n '1,240p' tests/recruiting-api.test.ts
```

Expected: identify existing builder style for conversation, user message, assistant message, and leads.

- [ ] **Step 2: Add a failing test**

Add this test to `tests/recruiting-api.test.ts`:

```ts
import { buildTurnMetricsInsertPayload } from '@/lib/recruiting-rag/persistence'

// Add inside the existing relevant describe block, or create:
describe('recruiting chat metrics payloads', () => {
  it('builds turn metrics insert payloads with rounded timings', () => {
    const payload = buildTurnMetricsInsertPayload({
      conversationId: '11111111-1111-4111-8111-111111111111',
      assistantMessageId: '22222222-2222-4222-8222-222222222222',
      userId: 'user_123',
      userEmail: 'jane@example.com',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      status: 'completed',
      authMs: 10.4,
      requestParseMs: 1.2,
      persistenceMs: 22.8,
      ragMs: 3.5,
      promptChars: 4085,
      retrievedContextChars: 2731,
      retrievedChunkCount: 3,
      firstTokenMs: 740.2,
      totalMs: 2120.9,
    })

    assert.deepEqual(payload, {
      conversation_id: '11111111-1111-4111-8111-111111111111',
      assistant_message_id: '22222222-2222-4222-8222-222222222222',
      user_id: 'user_123',
      user_email: 'jane@example.com',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      status: 'completed',
      error_message: null,
      auth_ms: 10,
      request_parse_ms: 1,
      persistence_ms: 23,
      rag_ms: 4,
      prompt_chars: 4085,
      retrieved_context_chars: 2731,
      retrieved_chunk_count: 3,
      first_token_ms: 740,
      total_ms: 2121,
    })
  })
})
```

Run:

```bash
npm run test:unit
```

Expected: FAIL because `buildTurnMetricsInsertPayload` does not exist.

- [ ] **Step 3: Add the payload builder**

Add this to `src/lib/recruiting-rag/persistence.ts`:

```ts
export type RecruitingChatTurnMetricsInsert = {
  conversation_id: string | null
  assistant_message_id: string | null
  user_id: string
  user_email: string | null
  provider: string
  model: string
  status: 'completed' | 'error'
  error_message: string | null
  auth_ms: number | null
  request_parse_ms: number | null
  persistence_ms: number | null
  rag_ms: number | null
  prompt_chars: number
  retrieved_context_chars: number
  retrieved_chunk_count: number
  first_token_ms: number | null
  total_ms: number
}

type TurnMetricsInput = {
  conversationId?: string | null
  assistantMessageId?: string | null
  userId: string
  userEmail?: string | null
  provider: string
  model: string
  status: 'completed' | 'error'
  errorMessage?: string | null
  authMs?: number | null
  requestParseMs?: number | null
  persistenceMs?: number | null
  ragMs?: number | null
  promptChars: number
  retrievedContextChars: number
  retrievedChunkCount: number
  firstTokenMs?: number | null
  totalMs: number
}

function roundedMs(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.round(value))
}

export function buildTurnMetricsInsertPayload(input: TurnMetricsInput): RecruitingChatTurnMetricsInsert {
  return {
    conversation_id: input.conversationId ?? null,
    assistant_message_id: input.assistantMessageId ?? null,
    user_id: input.userId,
    user_email: input.userEmail?.trim() || null,
    provider: input.provider,
    model: input.model,
    status: input.status,
    error_message: input.errorMessage ?? null,
    auth_ms: roundedMs(input.authMs),
    request_parse_ms: roundedMs(input.requestParseMs),
    persistence_ms: roundedMs(input.persistenceMs),
    rag_ms: roundedMs(input.ragMs),
    prompt_chars: input.promptChars,
    retrieved_context_chars: input.retrievedContextChars,
    retrieved_chunk_count: input.retrievedChunkCount,
    first_token_ms: roundedMs(input.firstTokenMs),
    total_ms: Math.max(0, Math.round(input.totalMs)),
  }
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
npm run test:unit
```

Expected: PASS for the new payload test.

---

### Task 3: Add Supabase Metrics Write Helper

**Files:**
- Modify: `src/lib/recruiting-rag/db.ts`

- [ ] **Step 1: Add import**

Update the import from `./persistence`:

```ts
import {
  buildConversationInsertPayload,
  type NormalizedLeadPayload,
  type RecruitingChatMessageInsert,
  type RecruitingChatTurnMetricsInsert,
} from './persistence'
```

- [ ] **Step 2: Add DB helper**

Add this near `saveRecruitingChatMessage()`:

```ts
export async function saveRecruitingChatTurnMetrics(input: RecruitingChatTurnMetricsInsert) {
  const { error } = await (db().from('recruiting_chat_turn_metrics') as any).insert(input) // eslint-disable-line @typescript-eslint/no-explicit-any
  if (error) throw error
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

---

### Task 4: Instrument `/api/recruiting-chat`

**Files:**
- Modify: `src/app/api/recruiting-chat/route.ts`

- [ ] **Step 1: Add imports**

Update imports:

```ts
import { performance } from 'node:perf_hooks'
```

Add persistence/helper imports:

```ts
import {
  buildAssistantPersistencePayload,
  buildTurnMetricsInsertPayload,
  buildUserPersistencePayload,
} from '@/lib/recruiting-rag/persistence'
```

```ts
import {
  getOrCreateRecruitingConversation,
  saveRecruitingChatMessage,
  saveRecruitingChatTurnMetrics,
} from '@/lib/recruiting-rag/db'
```

- [ ] **Step 2: Add safe metrics write helper**

Add this near `saveRecruitingChatMessageSafely()`:

```ts
async function saveRecruitingChatTurnMetricsSafely(
  input: Parameters<typeof saveRecruitingChatTurnMetrics>[0]
) {
  try {
    await saveRecruitingChatTurnMetrics(input)
  } catch (error) {
    console.error('Recruiting chat metrics persistence failed:', error)
  }
}
```

- [ ] **Step 3: Capture route timings**

Inside `POST`, add timing variables in this shape:

```ts
const requestStartedAt = performance.now()
let authFinishedAt = requestStartedAt
let requestParsedAt = requestStartedAt
let persistenceFinishedAt = requestStartedAt
let ragFinishedAt = requestStartedAt
let promptChars = 0
let retrievedContextChars = 0
let retrievedChunkCount = 0
```

After `auth()` and email lookup:

```ts
authFinishedAt = performance.now()
```

After `await request.json()` and validation:

```ts
requestParsedAt = performance.now()
```

After `getOrCreateRecruitingConversation()` and the user message save:

```ts
persistenceFinishedAt = performance.now()
```

After `prepareRagForChat()`:

```ts
ragFinishedAt = performance.now()
retrievedContextChars = rag.retrievedContext.length
retrievedChunkCount = rag.usedChunkIds.length
```

Build the system prompt once:

```ts
const systemPrompt = buildRecruitingSystemPrompt({
  retrievedContext: rag.retrievedContext,
  hasStrongContext: rag.hasStrongContext,
})
promptChars = systemPrompt.length
```

Pass `system: systemPrompt` into `streamText()`.

- [ ] **Step 4: Store metrics after finish**

Inside `onFinish`, after saving the assistant message, write metrics:

```ts
const assistantText = getMessageText(responseMessage)
if (!assistantText) return

await saveRecruitingChatMessageSafely(
  buildAssistantPersistencePayload({
    conversationId,
    content: assistantText,
    retrievedSources: rag.retrievedSources,
  })
)

await saveRecruitingChatTurnMetricsSafely(
  buildTurnMetricsInsertPayload({
    conversationId,
    userId,
    userEmail,
    provider: modelConfig.provider,
    model: modelConfig.model,
    status: 'completed',
    authMs: authFinishedAt - requestStartedAt,
    requestParseMs: requestParsedAt - authFinishedAt,
    persistenceMs: persistenceFinishedAt - requestParsedAt,
    ragMs: ragFinishedAt - persistenceFinishedAt,
    promptChars,
    retrievedContextChars,
    retrievedChunkCount,
    firstTokenMs: null,
    totalMs: performance.now() - requestStartedAt,
  })
)
```

Note: `assistant_message_id` stays `null` in the first implementation because `saveRecruitingChatMessage()` currently does not return inserted IDs. Avoid changing that contract unless needed later.

- [ ] **Step 5: Store metrics on stream error**

Inside `onError`, add a best-effort metrics write before returning the message:

```ts
void saveRecruitingChatTurnMetricsSafely(
  buildTurnMetricsInsertPayload({
    conversationId,
    userId,
    userEmail,
    provider: modelConfig.provider,
    model: modelConfig.model,
    status: 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    authMs: authFinishedAt - requestStartedAt,
    requestParseMs: requestParsedAt - authFinishedAt,
    persistenceMs: persistenceFinishedAt - requestParsedAt,
    ragMs: ragFinishedAt - persistenceFinishedAt,
    promptChars,
    retrievedContextChars,
    retrievedChunkCount,
    firstTokenMs: null,
    totalMs: performance.now() - requestStartedAt,
  })
)
```

Expected behavior: metrics errors are logged but never sent to the user.

- [ ] **Step 6: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

---

### Task 5: Verify Database Write

**Files:**
- No new files unless fixing discovered issues.

- [ ] **Step 1: Apply migration to Supabase**

Use the same migration application approach already used for this project. If using `psql`, source `.env` and apply the generated migration file.

Expected: migration succeeds.

- [ ] **Step 2: Smoke insert with service role**

Run a one-off script or SQL insert equivalent that inserts and deletes one row:

```sql
insert into public.recruiting_chat_turn_metrics (
  conversation_id,
  user_id,
  user_email,
  provider,
  model,
  status,
  rag_ms,
  prompt_chars,
  retrieved_context_chars,
  retrieved_chunk_count,
  first_token_ms,
  total_ms
) values (
  null,
  'smoke_user',
  'smoke@example.com',
  'openai',
  'gpt-5.4-mini',
  'completed',
  3,
  4085,
  2731,
  3,
  null,
  1200
)
returning id;
```

Then delete that returned `id`.

Expected: insert and delete both succeed using service role credentials.

---

### Task 6: Full Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run static checks**

Run:

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
```

Expected: all pass.

- [ ] **Step 2: Manual chat smoke test**

Start local dev server:

```bash
npm run dev
```

Ask one short chat question:

```text
Jane học ở đâu?
```

Expected:
- Chat response streams normally.
- No visible delay added before first text.
- Server logs do not show metrics persistence failures.

- [ ] **Step 3: Query metrics**

In Supabase SQL editor or `psql`, run:

```sql
select
  created_at,
  user_id,
  user_email,
  provider,
  model,
  status,
  rag_ms,
  prompt_chars,
  retrieved_context_chars,
  retrieved_chunk_count,
  first_token_ms,
  total_ms
from public.recruiting_chat_turn_metrics
order by created_at desc
limit 10;
```

Expected:
- Latest test request appears.
- `total_ms` is populated.
- `rag_ms`, `prompt_chars`, `retrieved_context_chars`, and `retrieved_chunk_count` are populated.
- `first_token_ms` is `null` for this first implementation.

---

## Follow-Up Not Included

- Capturing true `first_token_ms` may require wrapping/observing stream parts. Defer until after basic metrics are reliable.
- Admin charts or UI display are not included.
- Provider-side usage/token capture is not included unless the SDK exposes stable usage metadata in the current response shape.

---

## Self-Review

**Spec coverage:** The plan stores latency metrics, keeps writes non-blocking relative to first visible response, uses Supabase safely with RLS and service-role-only access, and includes verification.

**Placeholder scan:** No implementation steps use TBD/TODO placeholders. The migration filename contains `<timestamp>` because Supabase CLI generates it; the command is exact.

**Type consistency:** `RecruitingChatTurnMetricsInsert`, `buildTurnMetricsInsertPayload()`, and `saveRecruitingChatTurnMetrics()` names are consistent across tasks.
