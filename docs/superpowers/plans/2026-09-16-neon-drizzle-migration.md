# Neon + Drizzle Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Jane AI's database off Supabase (free-tier auto-pause risk) onto Neon Postgres, accessed via Drizzle ORM instead of `@supabase/supabase-js`, without changing any observable app behavior (same JSON shapes, same routes, same UI) — and along the way fix three known bugs (non-atomic multi-step writes, N+1 query in `/api/reminders`, rate-limiter fails open silently).

**Architecture:** Introduce `src/lib/db/` as a small data-access layer: `schema.ts` (Drizzle table defs), `types.ts` (shared row/domain types, replacing `src/lib/supabase.ts`'s exports), `client.ts` (lazy Drizzle instance over `@neondatabase/serverless`), and one module per table-group (`jd-history.ts`, `questionnaires.ts`, `post-campaigns.ts`, `connected-accounts.ts`, `feedback.ts`, `api-usage.ts`) exposing small typed functions. Existing files that already encapsulate DB access (`src/lib/rate-limit.ts`, `src/lib/recruiting-rag/db.ts`, `src/lib/health/check.ts`) are rewritten in place, keeping their exported function signatures identical so their callers outside this plan's scope (`recruiting-chat`, `recruiting-leads` routes) need no changes. All 24 Next.js route/page files that currently call `getSupabaseAdmin()` directly are rewired to import from the new modules instead.

**Tech Stack:** `drizzle-orm` + `drizzle-kit` + `@neondatabase/serverless` (HTTP driver, `drizzle-orm/neon-http`) — chosen over a persistent-connection driver because Vercel serverless functions can spin up many concurrent invocations and an HTTP-based driver has no connection-pool exhaustion risk. Existing test runner: Node's built-in `node:test` + `node:assert/strict` via `node --import tsx --test` (already configured as `npm run test:unit`); DB-touching tests run against a dedicated Neon **dev branch** (never against the prod branch) via a separate `TEST_DATABASE_URL` env var.

**Column naming decision:** Drizzle schema columns use **snake_case JS property names** (`job_title`, not `jobTitle`) even though Drizzle's own style guide prefers camelCase. This is deliberate: the live schema's column names are already snake_case, and 6 additional files outside the 24-file query-writing scope (`src/app/app/page.tsx`, `src/app/q/[token]/page.tsx`, `src/components/ChannelPostBlock.tsx`, `src/components/PostingCard.tsx`, `src/components/QuestionnaireSummary.tsx`, `src/components/QuestionnaireWizard.tsx`) import types like `JdHistory`/`Question`/`PostCampaign` and read their fields as snake_case throughout the UI. Renaming to camelCase would cascade far beyond this migration's actual goal (getting off Supabase) for zero benefit. Task 13 updates only those 6 files' *import path*, not their field access.

---

## Prerequisite research already done (context for every task below)

The live Supabase schema was introspected on 2026-09-16 via PostgREST's OpenAPI endpoint (`GET {SUPABASE_URL}/rest/v1/` with header `Accept: application/openapi+json`, using the service-role key already in `.env.local` — read-only, no data touched) because 5 of the 10 tables (`jd_history`, `post_campaigns`, `connected_accounts`, `feedback`, `api_usage`) have no `CREATE TABLE` DDL anywhere in this repo (they were created directly in the Supabase dashboard). The exact column list, types, nullability, and defaults for all 10 tables are baked into the schema in Task 2 below — no further introspection is needed before writing code.

Also confirmed via grep: every one of the 24 files uses `getSupabaseAdmin()` (service-role) exclusively; `getSupabase()` (anon-key client) has zero call sites anywhere in `src/`, so it is dropped entirely (not ported). No file uses `.storage.`, `.channel(`, or `supabase.auth` — this is a pure Postgres-via-PostgREST usage, nothing Supabase-platform-specific to replace beyond the DB connection itself.

---

## Task 1: Provision Neon + install dependencies + config

**Files:**
- Create: `drizzle.config.ts`
- Modify: `package.json`
- Modify: `.env.local` (add `DATABASE_URL`, `TEST_DATABASE_URL`)
- Modify: `.gitignore` (verify `.env*.local` already ignored — it should be; just confirm)

- [ ] **Step 1: Provision Neon (manual, human action — not automatable from this session)**

Go to https://console.neon.tech, sign in, create a new project (any region close to your Vercel deployment region is fine — Neon's free tier is region-limited to a few AWS regions, pick the closest). Name it `jane-ai` or similar.

From the Neon dashboard, create **two branches**:
1. `main` — this becomes production. Copy its pooled connection string (Neon dashboard → your project → Connection Details → make sure "Pooled connection" is selected) into a scratch note; you'll add it to Vercel in Task 16, not now.
2. `dev` — branched off `main` (Neon's branch-create UI does this in one click; it starts as an exact copy, cheap/instant since Neon uses copy-on-write storage). Copy its connection string too.

Enable the `pgcrypto` extension on **both branches** (needed for `gen_random_uuid()` and the questionnaire `token`'s `gen_random_bytes()`): in the Neon SQL Editor for each branch, run:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

- [ ] **Step 2: Add connection strings to `.env.local`**

Append to `.env.local` (do not commit this file — verify it's already gitignored):

```
DATABASE_URL=<main branch pooled connection string>
TEST_DATABASE_URL=<dev branch pooled connection string>
```

Run to confirm `.env.local` is ignored:

```bash
git check-ignore .env.local
```

Expected: prints `.env.local` (confirms it's ignored). If it prints nothing, STOP and fix `.gitignore` before continuing — do not proceed with secrets in a trackable file.

- [ ] **Step 3: Install dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
```

- [ ] **Step 4: Verify installed Drizzle API before writing schema code**

This repo's `AGENTS.md` warns that library APIs can differ from training-data assumptions for the pinned Next.js version — the same caution applies to any newly-added dependency. Before writing `src/lib/db/schema.ts` in Task 2, run:

```bash
npm ls drizzle-orm drizzle-kit @neondatabase/serverless
```

and skim `node_modules/drizzle-orm/pg-core/table.d.ts` (or the package's own docs) to confirm the current syntax for: the third `pgTable(name, columns, (table) => [...])` config-callback returning an array of constraints, the `check()` and `unique()` helpers' exact import path (`drizzle-orm/pg-core`), and `.$type<T>()` on `jsonb()`/`text().array()` columns. Task 2's code below is written against the API as of this plan's authoring (drizzle-orm ~0.36+ style); adjust only if the installed version's types disagree — do not change the resulting table/column names or defaults.

- [ ] **Step 5: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

- [ ] **Step 6: Add `db:generate` and `db:migrate` scripts to `package.json`**

In the `"scripts"` block, add (keep every existing script as-is):

```json
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
```

- [ ] **Step 7: Commit**

```bash
git add drizzle.config.ts package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: add Drizzle + Neon dependencies and config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(`.env.local` is gitignored — nothing else to add there.)

---

## Task 2: Drizzle schema + shared types module

**Files:**
- Create: `src/lib/db/types.ts`
- Create: `src/lib/db/schema.ts`

- [ ] **Step 1: Write `src/lib/db/types.ts`**

These are the hand-authored domain types moved verbatim from `src/lib/supabase.ts` (the jsonb-column shapes and pure app-level types that Drizzle can't infer), plus the DB row types re-exported for backward-compatible imports from the 6 UI files touched in Task 13.

```ts
export type Question = {
  id: string
  section: number
  sectionLabel: string
  text: string
  hint?: string
  type: 'yes_no' | 'multiple_choice' | 'open' | 'skill_matrix' | 'checkbox_multi'
  options?: string[]
  aiPrefilled?: boolean
}

export type ContentStyle =
  | 'announcement'
  | 'story_telling'
  | 'benefit_focus'
  | 'seeding'
  | 'trending_funny'
  | 'opinion_hook'
  | 'relatable_scenario'
  | 'insider_drop'
  | 'english_announcement'

export type ChannelRecommendation = {
  channel: 'linkedin' | 'facebook' | 'threads' | 'topcv'
  stars: number
  reason: string
}

export type ChannelRecommendations = {
  job_type: string
  seniority: string
  channel_recommendations: ChannelRecommendation[]
}

// Giữ nguyên GeneratedPosts cho backwards compat (vẫn dùng trong campaigns)
export type GeneratedPosts = {
  linkedin: string
  facebook: string
  threads: string
  topcv: string
  job_type: string
  channel_recommendations: ChannelRecommendation[]
}
```

- [ ] **Step 2: Write `src/lib/db/schema.ts`**

```ts
import { pgTable, uuid, text, jsonb, timestamp, boolean, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { Question } from './types'

export const jdHistory = pgTable('jd_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_title: text('job_title').notNull(),
  raw_input: text('raw_input').notNull(),
  generated_jd: text('generated_jd').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  user_id: text('user_id'),
  status: text('status').notNull().default('active'),
}, (table) => [
  check('jd_history_status_check', sql`${table.status} in ('active', 'hired')`),
])

export const questionnaires = pgTable('questionnaires', {
  id: uuid('id').primaryKey().defaultRandom(),
  jd_history_id: uuid('jd_history_id').references(() => jdHistory.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique().default(sql`encode(gen_random_bytes(16), 'hex')`),
  questions: jsonb('questions').$type<Question[]>().notNull().default(sql`'[]'::jsonb`),
  prefilled_answers: jsonb('prefilled_answers').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('pending'),
  expires_at: timestamp('expires_at', { withTimezone: true }).default(sql`(now() + interval '30 days')`),
  created_at: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  language: text('language').notNull().default('vi'),
  is_resend: boolean('is_resend').notNull().default(false),
}, (table) => [
  check('questionnaires_status_check', sql`${table.status} in ('pending', 'answered')`),
])

export const questionnaireAnswers = pgTable('questionnaire_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionnaire_id: uuid('questionnaire_id')
    .references(() => questionnaires.id, { onDelete: 'cascade' })
    .unique(),
  answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).default(sql`now()`),
})

export const postCampaigns = pgTable('post_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  jd_history_id: uuid('jd_history_id').references(() => jdHistory.id),
  channel: text('channel').notNull(),
  content: text('content').notNull(),
  status: text('status').notNull().default('draft'),
  platform_post_id: text('platform_post_id'),
  posted_at: timestamp('posted_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('post_campaigns_jd_history_id_channel_key').on(table.jd_history_id, table.channel),
  check('post_campaigns_status_check', sql`${table.status} in ('draft', 'posted', 'failed')`),
  check('post_campaigns_channel_check', sql`${table.channel} in ('linkedin', 'facebook', 'threads', 'topcv')`),
])

export const connectedAccounts = pgTable('connected_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  platform: text('platform').notNull(),
  access_token: text('access_token').notNull(),
  refresh_token: text('refresh_token'),
  token_expires_at: timestamp('token_expires_at', { withTimezone: true }),
  platform_user_id: text('platform_user_id'),
  platform_user_name: text('platform_user_name'),
  facebook_pages: jsonb('facebook_pages').$type<Array<{ id: string; name: string; access_token: string }>>(),
  selected_page_id: text('selected_page_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('connected_accounts_user_id_platform_key').on(table.user_id, table.platform),
  check('connected_accounts_platform_check', sql`${table.platform} in ('linkedin', 'facebook', 'threads')`),
])

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  email: text('email'),
  message: text('message').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const apiUsage = pgTable('api_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  called_at: timestamp('called_at', { withTimezone: true }).notNull().defaultNow(),
})

export const recruitingChatConversations = pgTable('recruiting_chat_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  user_email: text('user_email'),
})

export const recruitingChatMessages = pgTable('recruiting_chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id')
    .notNull()
    .references(() => recruitingChatConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  used_chunk_ids: text('used_chunk_ids').array().notNull().default(sql`'{}'::text[]`),
  sources: jsonb('sources').notNull().default(sql`'[]'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('recruiting_chat_messages_role_check', sql`${table.role} in ('user', 'assistant')`),
])

export const recruitingLeads = pgTable('recruiting_leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  conversation_id: uuid('conversation_id').references(() => recruitingChatConversations.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  name: text('name'),
  company: text('company'),
  hiring_need: text('hiring_need'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  phone: text('phone'),
})

export type JdHistory = typeof jdHistory.$inferSelect
export type Questionnaire = typeof questionnaires.$inferSelect
export type QuestionnaireAnswer = typeof questionnaireAnswers.$inferSelect
export type PostCampaign = typeof postCampaigns.$inferSelect
export type ConnectedAccount = typeof connectedAccounts.$inferSelect
```

- [ ] **Step 3: Re-export DB row types from `types.ts` for backward-compatible imports**

Append to `src/lib/db/types.ts`:

```ts
export type { JdHistory, Questionnaire, QuestionnaireAnswer, PostCampaign, ConnectedAccount } from './schema'
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/types.ts
git commit -m "$(cat <<'EOF'
feat(db): add Drizzle schema for all 10 tables

Column names kept snake_case to match live DB and avoid touching
UI components that already read snake_case fields.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Generate and apply the initial migration (dev branch first)

**Files:**
- Create: `drizzle/0000_<auto-generated-name>.sql` (generated, not hand-written)
- Create: `drizzle/meta/*` (generated)

- [ ] **Step 1: Generate the migration from schema.ts**

```bash
npm run db:generate
```

Expected: creates `drizzle/0000_<name>.sql` (name is auto-picked by drizzle-kit) containing `CREATE TABLE` statements for all 10 tables, their FKs, unique constraints, and check constraints. Open the generated file and read it — confirm all 10 tables are present and the two `unique(...)` composite constraints (`post_campaigns_jd_history_id_channel_key`, `connected_accounts_user_id_platform_key`) appear.

- [ ] **Step 2: Apply the migration to the Neon `dev` branch**

```bash
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
```

(Reads `TEST_DATABASE_URL` from `.env.local` — make sure your shell loads it, e.g. `export $(grep -v '^#' .env.local | xargs)` first, or run via `node --env-file=.env.local` wrapper if your Node version supports it. Either way, the important part is this command must run against the **dev** branch, not `DATABASE_URL`/main.)

Expected output: drizzle-kit reports 1 migration applied, no errors.

- [ ] **Step 3: Smoke-check the dev branch schema**

In the Neon SQL Editor for the `dev` branch, run:

```sql
select table_name from information_schema.tables where table_schema = 'public' order by 1;
```

Expected: exactly these 10 rows: `api_usage`, `connected_accounts`, `feedback`, `jd_history`, `post_campaigns`, `questionnaire_answers`, `questionnaires`, `recruiting_chat_conversations`, `recruiting_chat_messages`, `recruiting_leads`.

- [ ] **Step 4: Commit the generated migration**

```bash
git add drizzle/
git commit -m "$(cat <<'EOF'
feat(db): generate initial Drizzle migration for all 10 tables

Applied to Neon dev branch; main branch gets this in the cutover task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: DB client module

**Files:**
- Create: `src/lib/db/client.ts`
- Test: `tests/db-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

test('createDb can run a trivial query against TEST_DATABASE_URL', async () => {
  const url = process.env.TEST_DATABASE_URL
  assert.ok(url, 'TEST_DATABASE_URL must be set to run db tests')
  const db = createDb(url!)
  const rows = await db.execute(sql`select 1 as one`)
  assert.equal(Number(rows[0].one), 1)
})

test('createDb supports a transaction that commits both statements', async () => {
  const db = createDb(process.env.TEST_DATABASE_URL!)
  const tableName = `tx_smoke_test_${Date.now()}`
  await db.execute(sql.raw(`create table ${tableName} (id int)`))
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`insert into ${tableName} (id) values (1)`))
      await tx.execute(sql.raw(`insert into ${tableName} (id) values (2)`))
    })
    const rows = await db.execute(sql.raw(`select count(*) as c from ${tableName}`))
    assert.equal(Number(rows[0].c), 2)
  } finally {
    await db.execute(sql.raw(`drop table ${tableName}`))
  }
})
```

- [ ] **Step 2: Run test to verify it fails (module doesn't exist yet)**

Run: `npm run test:unit -- tests/db-client.test.ts` (or `node --import tsx --test tests/db-client.test.ts` if the glob script doesn't support single-file args — check `package.json`'s `test:unit` script; if it doesn't accept a path filter, just run the full `npm run test:unit` for this step)
Expected: FAIL — `Cannot find module '@/lib/db/client'`.

- [ ] **Step 3: Write `src/lib/db/client.ts`**

```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export function createDb(connectionString: string) {
  const sql = neon(connectionString)
  return drizzle(sql, { schema })
}

let _warned = false
function warnIfLocalUsingRemoteDb() {
  if (_warned) return
  if (process.env.NODE_ENV !== 'development') return
  const url = process.env.DATABASE_URL || ''
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1')
  if (url && !isLocal) {
    _warned = true
    const masked = url.replace(/:[^:@/]+@/, ':***@')
    console.warn(
      `\n⚠️  LOCAL DEV đang dùng Neon REMOTE (${masked}).\n` +
      `    Mọi thao tác GHI sẽ đụng DB thật. Cẩn thận khi test/xoá.\n`,
    )
  }
}

let _db: ReturnType<typeof createDb> | null = null
export function getDb() {
  warnIfLocalUsingRemoteDb()
  if (!_db) {
    _db = createDb(process.env.DATABASE_URL!)
  }
  return _db
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`
Expected: both tests in `tests/db-client.test.ts` PASS. If the transaction test fails specifically (not the connectivity one), see the note below before proceeding — it means `drizzle-orm/neon-http`'s transaction support doesn't behave as expected on the installed version, and Task 6 (which needs a real transaction) will need `drizzle-orm/neon-serverless` (WebSocket driver, full transaction support) instead — swap the import in this file from `neon-http` to `neon-serverless` and `neon` to `Pool` per that driver's README, re-run this test, and continue.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/client.ts tests/db-client.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add Drizzle client factory over Neon HTTP driver

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `jd_history` module + rewire its 4 consumer routes

**Files:**
- Create: `src/lib/db/jd-history.ts`
- Test: `tests/db-jd-history.test.ts`
- Modify: `src/app/api/generate/route.ts`
- Modify: `src/app/api/history/route.ts`
- Modify: `src/app/api/history/[id]/route.ts`
- Modify: `src/app/api/jd-history/[id]/status/route.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import {
  insertJdHistory,
  getJdHistoryById,
  listJdHistory,
  updateJdHistoryStatus,
  countJdHistory,
} from '@/lib/db/jd-history'
import { jdHistory } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanup(id: string) {
  await testDb.delete(jdHistory).where(eq(jdHistory.id, id))
}

test('insertJdHistory returns the new row id', async () => {
  const { id } = await insertJdHistory({
    job_title: 'Test Title',
    raw_input: 'raw',
    generated_jd: 'generated',
    user_id: 'user_test_1',
  })
  assert.ok(id)
  await cleanup(id)
})

test('getJdHistoryById scopes to userId when provided, ignores it when omitted (admin)', async () => {
  const { id } = await insertJdHistory({
    job_title: 'Scoped Title',
    raw_input: 'raw',
    generated_jd: 'generated',
    user_id: 'owner_user',
  })
  try {
    const asOwner = await getJdHistoryById(id, { userId: 'owner_user' })
    assert.equal(asOwner?.job_title, 'Scoped Title')

    const asOther = await getJdHistoryById(id, { userId: 'someone_else' })
    assert.equal(asOther, null)

    const asAdmin = await getJdHistoryById(id, {})
    assert.equal(asAdmin?.job_title, 'Scoped Title')
  } finally {
    await cleanup(id)
  }
})

test('listJdHistory orders by created_at desc and respects limit', async () => {
  const a = await insertJdHistory({ job_title: 'A', raw_input: 'r', generated_jd: 'g', user_id: 'list_user' })
  const b = await insertJdHistory({ job_title: 'B', raw_input: 'r', generated_jd: 'g', user_id: 'list_user' })
  try {
    const rows = await listJdHistory({ userId: 'list_user', limit: 100 })
    const ids = rows.map((r) => r.id)
    assert.ok(ids.indexOf(b.id) < ids.indexOf(a.id), 'newer row (b) should come first')
  } finally {
    await cleanup(a.id)
    await cleanup(b.id)
  }
})

test('updateJdHistoryStatus only updates when user_id matches', async () => {
  const { id } = await insertJdHistory({ job_title: 'Status', raw_input: 'r', generated_jd: 'g', user_id: 'status_user' })
  try {
    await updateJdHistoryStatus(id, 'someone_else', 'hired')
    const stillActive = await getJdHistoryById(id, {})
    assert.equal(stillActive?.status, 'active')

    await updateJdHistoryStatus(id, 'status_user', 'hired')
    const nowHired = await getJdHistoryById(id, {})
    assert.equal(nowHired?.status, 'hired')
  } finally {
    await cleanup(id)
  }
})

test('countJdHistory returns a number >= 0', async () => {
  const n = await countJdHistory()
  assert.ok(typeof n === 'number' && n >= 0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '@/lib/db/jd-history'`.

- [ ] **Step 3: Write `src/lib/db/jd-history.ts`**

```ts
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from './client'
import { jdHistory } from './schema'

export async function insertJdHistory(values: {
  job_title: string
  raw_input: string
  generated_jd: string
  user_id: string | null
}): Promise<{ id: string }> {
  const rows = await getDb().insert(jdHistory).values(values).returning({ id: jdHistory.id })
  return rows[0]
}

export async function getJdHistoryById(
  id: string,
  opts: { userId?: string },
): Promise<typeof jdHistory.$inferSelect | null> {
  const rows = await getDb()
    .select()
    .from(jdHistory)
    .where(and(eq(jdHistory.id, id), opts.userId ? eq(jdHistory.user_id, opts.userId) : undefined))
    .limit(1)
  return rows[0] ?? null
}

export async function listJdHistory(opts: {
  userId?: string
  limit: number
}): Promise<Array<Pick<typeof jdHistory.$inferSelect, 'id' | 'job_title' | 'created_at' | 'user_id' | 'status'>>> {
  return getDb()
    .select({
      id: jdHistory.id,
      job_title: jdHistory.job_title,
      created_at: jdHistory.created_at,
      user_id: jdHistory.user_id,
      status: jdHistory.status,
    })
    .from(jdHistory)
    .where(opts.userId ? eq(jdHistory.user_id, opts.userId) : undefined)
    .orderBy(desc(jdHistory.created_at))
    .limit(opts.limit)
}

export async function listActiveJdHistoryForUser(
  userId: string,
): Promise<Array<Pick<typeof jdHistory.$inferSelect, 'id' | 'job_title' | 'created_at'>>> {
  return getDb()
    .select({ id: jdHistory.id, job_title: jdHistory.job_title, created_at: jdHistory.created_at })
    .from(jdHistory)
    .where(and(eq(jdHistory.user_id, userId), eq(jdHistory.status, 'active')))
}

export async function updateJdHistoryStatus(
  id: string,
  userId: string,
  status: 'active' | 'hired',
): Promise<void> {
  await getDb()
    .update(jdHistory)
    .set({ status })
    .where(and(eq(jdHistory.id, id), eq(jdHistory.user_id, userId)))
}

export async function getJdTitleById(id: string): Promise<string | null> {
  const rows = await getDb().select({ job_title: jdHistory.job_title }).from(jdHistory).where(eq(jdHistory.id, id)).limit(1)
  return rows[0]?.job_title ?? null
}

export async function countJdHistory(): Promise<number> {
  const rows = await getDb().select({ count: sql<number>`count(*)`.mapWith(Number) }).from(jdHistory)
  return rows[0].count
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: all 5 tests in `tests/db-jd-history.test.ts` PASS.

- [ ] **Step 5: Commit the module**

```bash
git add src/lib/db/jd-history.ts tests/db-jd-history.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add jd_history data-access module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Rewire `src/app/api/generate/route.ts`**

Replace the import and the insert call. Full new file:

```ts
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@clerk/nextjs/server'
import { insertJdHistory } from '@/lib/db/jd-history'
import { checkRateLimit } from '@/lib/rate-limit'
import { callAnthropicWithFallback } from '@/lib/ai/models'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed } = await checkRateLimit(userId, 'generate')
  if (!allowed) {
    return NextResponse.json(
      { error: 'Bạn đã đạt giới hạn 10 lần tạo JD mỗi ngày. Thử lại vào ngày mai.' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    )
  }

  try {
    const { jobTitle, rawInput } = await req.json()

    if (!jobTitle || !rawInput) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 })
    }

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

    let jdHistoryId: string | null = null
    try {
      const inserted = await insertJdHistory({
        job_title: jobTitle,
        raw_input: rawInput,
        generated_jd: generatedJd,
        user_id: userId,
      })
      jdHistoryId = inserted.id
    } catch (err) {
      console.error('DB error inserting jd_history:', err)
    }

    return NextResponse.json({ generatedJd, jdHistoryId })
  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra, thử lại nhé!' }, { status: 500 })
  }
}
```

- [ ] **Step 7: Rewire `src/app/api/history/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { listJdHistory } from '@/lib/db/jd-history'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

export async function GET() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userEmails = user.emailAddresses.map((e) => e.emailAddress)
  const isAdmin = ADMIN_EMAILS.some((adminEmail) => userEmails.includes(adminEmail))

  try {
    const data = await listJdHistory({ userId: isAdmin ? undefined : user.id, limit: 100 })
    return NextResponse.json({ history: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}
```

- [ ] **Step 8: Rewire `src/app/api/history/[id]/route.ts`**

This one also needs the "latest questionnaire for this jd" lookup — added properly in Task 6 once `src/lib/db/questionnaires.ts` exists. For now, import the not-yet-created `getLatestQuestionnaireForJd` too (Task 6 creates it); this step's edit is written assuming Task 6 has already landed, so **do Task 6 before this step** if executing tasks strictly in order — or come back and finish this step after Task 6. Full new file:

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getJdHistoryById } from '@/lib/db/jd-history'
import { getLatestQuestionnaireForJd } from '@/lib/db/questionnaires'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const user = await currentUser()
  const userEmails = user?.emailAddresses.map((e) => e.emailAddress) ?? []
  const isAdmin = ADMIN_EMAILS.some((adminEmail) => userEmails.includes(adminEmail))

  const item = await getJdHistoryById(id, { userId: isAdmin ? undefined : userId })

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const q = await getLatestQuestionnaireForJd(id)

  return NextResponse.json({
    item: {
      ...item,
      questionnaire_id: q?.id ?? null,
      questionnaire_token: q?.token ?? null,
    },
  })
}
```

(Note: `currentUser` used to be dynamically `await import`ed inline in the original file — that was an unnecessary micro-optimization since the module is tiny; importing it normally at the top is equivalent and simpler.)

- [ ] **Step 9: Rewire `src/app/api/jd-history/[id]/status/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { updateJdHistoryStatus } from '@/lib/db/jd-history'

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

  try {
    await updateJdHistoryStatus(id, userId, status)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}
```

- [ ] **Step 10: Commit route rewiring** (only after Task 6 has landed `getLatestQuestionnaireForJd`, so `history/[id]/route.ts` actually compiles)

```bash
git add src/app/api/generate/route.ts src/app/api/history/route.ts \
  "src/app/api/history/[id]/route.ts" "src/app/api/jd-history/[id]/status/route.ts"
git commit -m "$(cat <<'EOF'
refactor: rewire jd_history routes to Drizzle module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `questionnaires` module (with transaction fix) + rewire its 7 consumers

**Files:**
- Create: `src/lib/db/questionnaires.ts`
- Test: `tests/db-questionnaires.test.ts`
- Modify: `src/app/api/questionnaire/generate/route.ts`
- Modify: `src/app/api/q/[token]/route.ts`
- Modify: `src/app/api/q/[token]/submit/route.ts`
- Modify: `src/app/api/questionnaire/[id]/answers/route.ts`
- Modify: `src/app/api/questionnaire/[id]/summary/route.ts`
- Modify: `src/app/api/questionnaire/resend/route.ts`
- Modify: `src/app/q/[token]/summary/page.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import {
  insertQuestionnaire,
  getQuestionnaireByToken,
  getQuestionnaireById,
  getLatestQuestionnaireForJd,
  insertQuestionnaireAnswerAndMarkAnswered,
  getLatestAnswerForQuestionnaire,
} from '@/lib/db/questionnaires'
import { insertJdHistory } from '@/lib/db/jd-history'
import { jdHistory, questionnaires, questionnaireAnswers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanupJd(id: string) {
  // cascades to questionnaires -> questionnaire_answers via FK on delete cascade
  await testDb.delete(jdHistory).where(eq(jdHistory.id, id))
}

test('insertQuestionnaire returns id and a DB-generated token', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const q = await insertQuestionnaire({
      jd_history_id: jd.id,
      questions: [],
      prefilled_answers: {},
      language: 'vi',
    })
    assert.ok(q.id)
    assert.ok(q.token && q.token.length > 0)
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getQuestionnaireByToken finds it, returns null for unknown token', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test 2', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const q = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    const found = await getQuestionnaireByToken(q.token)
    assert.equal(found?.id, q.id)

    const missing = await getQuestionnaireByToken('nonexistent-token-xyz')
    assert.equal(missing, null)
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getLatestQuestionnaireForJd returns the most recently created one', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test 3', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const first = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    await new Promise((r) => setTimeout(r, 10))
    const second = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi', is_resend: true })
    const latest = await getLatestQuestionnaireForJd(jd.id)
    assert.equal(latest?.id, second.id)
    void first
  } finally {
    await cleanupJd(jd.id)
  }
})

test('insertQuestionnaireAnswerAndMarkAnswered is atomic: both writes land together', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test 4', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const q = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    await insertQuestionnaireAnswerAndMarkAnswered(q.id, { hello: 'world' })

    const updated = await getQuestionnaireById(q.id)
    assert.equal(updated?.status, 'answered')

    const answer = await getLatestAnswerForQuestionnaire(q.id)
    assert.deepEqual(answer?.answers, { hello: 'world' })
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getLatestAnswerForQuestionnaire returns null when no answer submitted yet', async () => {
  const jd = await insertJdHistory({ job_title: 'Q Test 5', raw_input: 'r', generated_jd: 'g', user_id: 'q_user' })
  try {
    const q = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    const answer = await getLatestAnswerForQuestionnaire(q.id)
    assert.equal(answer, null)
  } finally {
    await cleanupJd(jd.id)
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '@/lib/db/questionnaires'`.

- [ ] **Step 3: Write `src/lib/db/questionnaires.ts`**

```ts
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from './client'
import { questionnaires, questionnaireAnswers } from './schema'
import type { Question } from './types'

export async function insertQuestionnaire(values: {
  jd_history_id: string
  questions: Question[]
  prefilled_answers: Record<string, unknown>
  language: 'vi' | 'en'
  is_resend?: boolean
}): Promise<{ id: string; token: string }> {
  const rows = await getDb()
    .insert(questionnaires)
    .values(values)
    .returning({ id: questionnaires.id, token: questionnaires.token })
  return rows[0]
}

export async function getQuestionnaireByToken(
  token: string,
): Promise<typeof questionnaires.$inferSelect | null> {
  const rows = await getDb().select().from(questionnaires).where(eq(questionnaires.token, token)).limit(1)
  return rows[0] ?? null
}

export async function getQuestionnaireById(
  id: string,
): Promise<typeof questionnaires.$inferSelect | null> {
  const rows = await getDb().select().from(questionnaires).where(eq(questionnaires.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getLatestQuestionnaireForJd(
  jdHistoryId: string,
): Promise<typeof questionnaires.$inferSelect | null> {
  const rows = await getDb()
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.jd_history_id, jdHistoryId))
    .orderBy(desc(questionnaires.created_at))
    .limit(1)
  return rows[0] ?? null
}

export async function insertQuestionnaireAnswerAndMarkAnswered(
  questionnaireId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.insert(questionnaireAnswers).values({ questionnaire_id: questionnaireId, answers })
    await tx.update(questionnaires).set({ status: 'answered' }).where(eq(questionnaires.id, questionnaireId))
  })
}

export async function getLatestAnswerForQuestionnaire(
  questionnaireId: string,
): Promise<typeof questionnaireAnswers.$inferSelect | null> {
  const rows = await getDb()
    .select()
    .from(questionnaireAnswers)
    .where(eq(questionnaireAnswers.questionnaire_id, questionnaireId))
    .orderBy(desc(questionnaireAnswers.submitted_at))
    .limit(1)
  return rows[0] ?? null
}
```

Note: `and(...)` isn't actually needed here (every query filters on one column), so it's not imported — keep imports minimal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: all 5 tests in `tests/db-questionnaires.test.ts` PASS. If the transaction test fails, revisit Task 4 Step 4's note about swapping to `drizzle-orm/neon-serverless`.

- [ ] **Step 5: Commit the module**

```bash
git add src/lib/db/questionnaires.ts tests/db-questionnaires.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add questionnaires data-access module

insertQuestionnaireAnswerAndMarkAnswered wraps the answer-insert and
status-update in one transaction, fixing a gap where Supabase's two
sequential calls could leave a questionnaire "pending" with an answer
already recorded if the second call failed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Rewire `src/app/api/questionnaire/generate/route.ts`**

Only the DB-touching tail changes — everything else (the giant prompt builder) is copied verbatim. Replace lines 1-6 (imports) and the block from `// eslint-disable-next-line ... jdRecord` through the end of the function:

```ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@clerk/nextjs/server'
import { insertJdHistory } from '@/lib/db/jd-history'
import { insertQuestionnaire } from '@/lib/db/questionnaires'
import type { Question } from '@/lib/db/types'
import { callAnthropicWithFallback } from '@/lib/ai/models'

export const dynamic = 'force-dynamic'
```

(keep `buildPrompt` unchanged verbatim)

```ts
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const { jdText, jobTitle: providedTitle, language = 'vi' } = await req.json() as {
      jdText: string
      jobTitle?: string
      language?: 'vi' | 'en'
    }

    if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
      return NextResponse.json({ error: 'Thiếu nội dung JD' }, { status: 400 })
    }

    const message = await callAnthropicWithFallback(client, 'heavy', {
      max_tokens: 6000,
      messages: [
        {
          role: 'user',
          content: buildPrompt(jdText, providedTitle, language),
        },
      ],
    })

    const firstBlock = message.content[0]
    const raw = firstBlock?.type === 'text' ? firstBlock.text : null
    if (!raw) {
      return NextResponse.json({ error: 'AI không trả về nội dung' }, { status: 502 })
    }
    const cleanRaw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleanRaw) as {
      jobTitle: string
      questions: Question[]
      prefilled_answers: Record<string, unknown>
    }

    if (!parsed.jobTitle || !Array.isArray(parsed.questions) || !parsed.prefilled_answers) {
      return NextResponse.json({ error: 'AI trả về dữ liệu không hợp lệ' }, { status: 502 })
    }

    let jdRecord: { id: string }
    try {
      jdRecord = await insertJdHistory({
        job_title: providedTitle || parsed.jobTitle || 'Không rõ vị trí',
        raw_input: jdText,
        generated_jd: jdText,
        user_id: userId,
      })
    } catch (err) {
      console.error('DB jd_history error:', err)
      return NextResponse.json({ error: 'Lỗi lưu JD' }, { status: 500 })
    }

    let data: { id: string; token: string }
    try {
      data = await insertQuestionnaire({
        jd_history_id: jdRecord.id,
        questions: parsed.questions,
        prefilled_answers: parsed.prefilled_answers,
        language,
      })
    } catch (err) {
      console.error('DB questionnaire error:', err)
      return NextResponse.json({ error: 'Lỗi lưu bảng hỏi' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, token: data.token, jd_history_id: jdRecord.id })
  } catch (error) {
    console.error('Generate questionnaire error:', error)
    return NextResponse.json({ error: 'Có lỗi xảy ra' }, { status: 500 })
  }
}
```

(This still leaves the same orphan-`jd_history`-row-on-second-insert-failure gap the original had — wrapping cross-table inserts spanning two different modules in one transaction would mean `insertJdHistory`+`insertQuestionnaire` need to share a `tx` object, which pushes both functions' signatures to accept an optional transaction handle. That's a real improvement but out of scope for a behavior-preserving migration; flagged here for a future follow-up rather than silently fixed, since fixing it changes two modules' public APIs.)

- [ ] **Step 7: Rewire `src/app/api/q/[token]/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getQuestionnaireByToken } from '@/lib/db/questionnaires'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const data = await getQuestionnaireByToken(token)

  if (!data) {
    return NextResponse.json({ error: 'Không tìm thấy bảng hỏi' }, { status: 404 })
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link đã hết hạn' }, { status: 410 })
  }

  if (data.status === 'answered') {
    return NextResponse.json({ error: 'Bảng hỏi đã được điền' }, { status: 409 })
  }

  return NextResponse.json({
    id: data.id,
    questions: data.questions,
    prefilled_answers: data.prefilled_answers,
    language: (data.language ?? 'vi') as 'vi' | 'en',
    is_resend: data.is_resend ?? false,
  })
}
```

- [ ] **Step 8: Rewire `src/app/api/q/[token]/submit/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getQuestionnaireByToken, insertQuestionnaireAnswerAndMarkAnswered } from '@/lib/db/questionnaires'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { answers } = await req.json()

  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Thiếu câu trả lời' }, { status: 400 })
  }

  const q = await getQuestionnaireByToken(token)

  if (!q) {
    return NextResponse.json({ error: 'Không tìm thấy bảng hỏi' }, { status: 404 })
  }

  if (q.expires_at && new Date(q.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link đã hết hạn' }, { status: 410 })
  }

  if (q.status === 'answered') {
    return NextResponse.json({ error: 'Đã submit rồi' }, { status: 409 })
  }

  try {
    await insertQuestionnaireAnswerAndMarkAnswered(q.id, answers)
  } catch (err) {
    console.error('Submit answers error:', err)
    return NextResponse.json({ error: 'Lỗi lưu câu trả lời' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 9: Rewire `src/app/api/questionnaire/[id]/answers/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getQuestionnaireById, getLatestAnswerForQuestionnaire } from '@/lib/db/questionnaires'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const q = await getQuestionnaireById(id)

  if (!q) {
    return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
  }

  const ans = await getLatestAnswerForQuestionnaire(id)

  return NextResponse.json({
    questionnaire: q,
    answers: ans?.answers ?? null,
    submitted_at: ans?.submitted_at ?? null,
  })
}
```

- [ ] **Step 10: Rewire `src/app/api/questionnaire/[id]/summary/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getQuestionnaireById, getLatestAnswerForQuestionnaire } from '@/lib/db/questionnaires'
import { getJdTitleById } from '@/lib/db/jd-history'
import type { Question } from '@/lib/db/types'

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

  const q = await getQuestionnaireById(id)
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const jobTitle = q.jd_history_id ? await getJdTitleById(q.jd_history_id) : null
  const ans = await getLatestAnswerForQuestionnaire(id)

  if (!ans) return NextResponse.json({ error: 'No answers yet' }, { status: 404 })

  return NextResponse.json({
    jobTitle: jobTitle ?? 'Không rõ vị trí',
    submittedAt: ans.submitted_at,
    questions: q.questions,
    answers: ans.answers,
    token: q.token,
  } satisfies QuestionnaireSummaryData)
}
```

- [ ] **Step 11: Rewire `src/app/api/questionnaire/resend/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getJdHistoryById } from '@/lib/db/jd-history'
import { getLatestQuestionnaireForJd, getLatestAnswerForQuestionnaire, insertQuestionnaire } from '@/lib/db/questionnaires'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jd_history_id } = await req.json() as { jd_history_id: string }
  if (!jd_history_id) return NextResponse.json({ error: 'Missing jd_history_id' }, { status: 400 })

  const jd = await getJdHistoryById(jd_history_id, { userId })
  if (!jd) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const latestQ = await getLatestQuestionnaireForJd(jd_history_id)
  if (!latestQ) return NextResponse.json({ error: 'No questionnaire found' }, { status: 404 })

  const latestAns = await getLatestAnswerForQuestionnaire(latestQ.id)
  const prefilled = latestAns?.answers ?? {}

  try {
    const newQ = await insertQuestionnaire({
      jd_history_id,
      questions: latestQ.questions,
      prefilled_answers: prefilled,
      language: (latestQ.language ?? 'vi') as 'vi' | 'en',
      is_resend: true,
    })
    return NextResponse.json({ id: newQ.id, token: newQ.token, jd_history_id })
  } catch (err) {
    console.error('Resend questionnaire error:', err)
    return NextResponse.json({ error: 'Lỗi tạo bảng hỏi mới' }, { status: 500 })
  }
}
```

- [ ] **Step 12: Rewire `src/app/q/[token]/summary/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getQuestionnaireByToken, getLatestAnswerForQuestionnaire } from '@/lib/db/questionnaires'
import { getJdTitleById } from '@/lib/db/jd-history'
import type { Question } from '@/lib/db/types'
import PrintTrigger from './PrintTrigger'
import PrintButton from './PrintButton'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const q = await getQuestionnaireByToken(token)
  const jobTitle = q?.jd_history_id ? await getJdTitleById(q.jd_history_id) : null
  return { title: `Jane AI - ${jobTitle ?? 'Hiring Brief'}` }
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
}

function renderAnswer(question: Question, answers: Record<string, unknown>): string {
  const value = answers[question.id]
  if (value == null) return '(chưa trả lời)'

  if (question.type === 'skill_matrix' && Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'object' && v !== null && 'skill' in v) {
          const s = v as { skill?: string; level?: string }
          if (typeof s.skill !== 'string') return String(v)
          return s.level ? `${s.skill} [${s.level}]` : s.skill
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

  const q = await getQuestionnaireByToken(token)
  if (!q) notFound()

  const jobTitle = q.jd_history_id ? await getJdTitleById(q.jd_history_id) : null
  const ans = await getLatestAnswerForQuestionnaire(q.id)

  if (!ans) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Sếp chưa điền bảng hỏi này.
      </div>
    )
  }

  const questions = q.questions as Question[]
  const answers = ans.answers as Record<string, unknown>

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
        <div className="no-print flex justify-end mb-6">
          <PrintButton />
        </div>

        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Jane AI · Hiring Brief</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{jobTitle ?? 'Không rõ vị trí'}</h1>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Submitted: {formatSubmittedAt(ans.submitted_at)}
          </p>
        </div>

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

        <div className="mt-10 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">Generated by Jane AI · jane-ai.app</p>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 13: Commit route rewiring**

```bash
git add src/app/api/questionnaire src/app/api/q "src/app/q/[token]/summary/page.tsx"
git commit -m "$(cat <<'EOF'
refactor: rewire questionnaire routes/pages to Drizzle module

submit route now uses the atomic insertQuestionnaireAnswerAndMarkAnswered.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Now go back and finish Task 5 Step 8 + Step 10 (`history/[id]/route.ts` needed `getLatestQuestionnaireForJd`, which now exists) if you hadn't already.

---

## Task 7: `post_campaigns` + `connected_accounts` modules + rewire 6 consumer routes

**Files:**
- Create: `src/lib/db/post-campaigns.ts`
- Create: `src/lib/db/connected-accounts.ts`
- Test: `tests/db-post-campaigns.test.ts`
- Test: `tests/db-connected-accounts.test.ts`
- Modify: `src/app/api/post-job/campaigns/route.ts`
- Modify: `src/app/api/post-job/generate/route.ts`
- Modify: `src/app/api/post-job/publish/route.ts`
- Modify: `src/app/api/auth/[platform]/callback/route.ts`
- Modify: `src/app/api/auth/[platform]/disconnect/route.ts`
- Modify: `src/app/api/auth/[platform]/status/route.ts`

- [ ] **Step 1: Write the failing tests for `post-campaigns.ts`**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import { insertJdHistory } from '@/lib/db/jd-history'
import {
  listCampaignsForJd,
  updateCampaignContent,
  upsertCampaignDraft,
  getCampaignWithOwner,
  markCampaignStatus,
} from '@/lib/db/post-campaigns'
import { jdHistory } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanupJd(id: string) {
  await testDb.delete(jdHistory).where(eq(jdHistory.id, id))
}

test('upsertCampaignDraft inserts then updates on conflict (jd_history_id, channel)', async () => {
  const jd = await insertJdHistory({ job_title: 'Campaign JD', raw_input: 'r', generated_jd: 'g', user_id: 'camp_user' })
  try {
    const first = await upsertCampaignDraft({ jd_history_id: jd.id, channel: 'linkedin', content: 'v1' })
    assert.equal(first.content, 'v1')

    const second = await upsertCampaignDraft({ jd_history_id: jd.id, channel: 'linkedin', content: 'v2' })
    assert.equal(second.id, first.id, 'same campaign row should be reused, not duplicated')
    assert.equal(second.content, 'v2')

    const all = await listCampaignsForJd(jd.id)
    assert.equal(all.length, 1)
  } finally {
    await cleanupJd(jd.id)
  }
})

test('getCampaignWithOwner joins jd_history.user_id', async () => {
  const jd = await insertJdHistory({ job_title: 'Owner JD', raw_input: 'r', generated_jd: 'g', user_id: 'owner_123' })
  try {
    const campaign = await upsertCampaignDraft({ jd_history_id: jd.id, channel: 'facebook', content: 'hello' })
    const withOwner = await getCampaignWithOwner(campaign.id)
    assert.equal(withOwner?.owner_user_id, 'owner_123')
  } finally {
    await cleanupJd(jd.id)
  }
})

test('updateCampaignContent and markCampaignStatus mutate the row', async () => {
  const jd = await insertJdHistory({ job_title: 'Mutate JD', raw_input: 'r', generated_jd: 'g', user_id: 'mut_user' })
  try {
    const campaign = await upsertCampaignDraft({ jd_history_id: jd.id, channel: 'threads', content: 'orig' })
    await updateCampaignContent(campaign.id, 'edited')
    await markCampaignStatus(campaign.id, 'posted', { platform_post_id: 'abc123', posted_at: new Date().toISOString() })

    const rows = await listCampaignsForJd(jd.id)
    assert.equal(rows[0].content, 'edited')
    assert.equal(rows[0].status, 'posted')
    assert.equal(rows[0].platform_post_id, 'abc123')
  } finally {
    await cleanupJd(jd.id)
  }
})
```

- [ ] **Step 2: Write the failing tests for `connected-accounts.ts`**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import {
  upsertConnectedAccount,
  deleteConnectedAccount,
  getConnectedAccountStatus,
  getConnectedAccountForPublish,
} from '@/lib/db/connected-accounts'
import { connectedAccounts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanup(userId: string, platform: string) {
  await testDb.delete(connectedAccounts).where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.platform, platform)))
}

test('upsertConnectedAccount inserts then updates on conflict (user_id, platform)', async () => {
  const userId = 'ca_user_1'
  try {
    await upsertConnectedAccount({ user_id: userId, platform: 'linkedin', access_token: 'enc1', platform_user_id: 'p1', platform_user_name: 'Name 1' })
    const first = await getConnectedAccountStatus(userId, 'linkedin')
    assert.equal(first?.platform_user_name, 'Name 1')

    await upsertConnectedAccount({ user_id: userId, platform: 'linkedin', access_token: 'enc2', platform_user_id: 'p1', platform_user_name: 'Name 2' })
    const second = await getConnectedAccountStatus(userId, 'linkedin')
    assert.equal(second?.platform_user_name, 'Name 2')
  } finally {
    await cleanup(userId, 'linkedin')
  }
})

test('getConnectedAccountForPublish exposes access_token, status endpoint does not', async () => {
  const userId = 'ca_user_2'
  try {
    await upsertConnectedAccount({ user_id: userId, platform: 'facebook', access_token: 'secret-token', platform_user_id: 'p2', platform_user_name: 'FB Name' })
    const forPublish = await getConnectedAccountForPublish(userId, 'facebook')
    assert.equal(forPublish?.access_token, 'secret-token')

    const status = await getConnectedAccountStatus(userId, 'facebook')
    assert.equal((status as unknown as { access_token?: string }).access_token, undefined)
  } finally {
    await cleanup(userId, 'facebook')
  }
})

test('deleteConnectedAccount removes the row', async () => {
  const userId = 'ca_user_3'
  await upsertConnectedAccount({ user_id: userId, platform: 'linkedin', access_token: 'x', platform_user_id: 'p3', platform_user_name: 'N' })
  await deleteConnectedAccount(userId, 'linkedin')
  const after = await getConnectedAccountStatus(userId, 'linkedin')
  assert.equal(after, null)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — both new modules don't exist yet.

- [ ] **Step 4: Write `src/lib/db/post-campaigns.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { getDb } from './client'
import { postCampaigns, jdHistory } from './schema'

export async function listCampaignsForJd(jdHistoryId: string) {
  return getDb()
    .select({
      id: postCampaigns.id,
      channel: postCampaigns.channel,
      content: postCampaigns.content,
      status: postCampaigns.status,
      posted_at: postCampaigns.posted_at,
      platform_post_id: postCampaigns.platform_post_id,
    })
    .from(postCampaigns)
    .where(eq(postCampaigns.jd_history_id, jdHistoryId))
    .orderBy(postCampaigns.created_at)
}

export async function updateCampaignContent(campaignId: string, content: string): Promise<void> {
  await getDb().update(postCampaigns).set({ content }).where(eq(postCampaigns.id, campaignId))
}

export async function upsertCampaignDraft(values: {
  jd_history_id: string
  channel: string
  content: string
}): Promise<typeof postCampaigns.$inferSelect> {
  const rows = await getDb()
    .insert(postCampaigns)
    .values({ ...values, status: 'draft' })
    .onConflictDoUpdate({
      target: [postCampaigns.jd_history_id, postCampaigns.channel],
      set: { content: values.content, status: 'draft' },
    })
    .returning()
  return rows[0]
}

export async function getCampaignWithOwner(campaignId: string): Promise<{
  id: string
  channel: string
  content: string
  status: string
  owner_user_id: string | null
} | null> {
  const rows = await getDb()
    .select({
      id: postCampaigns.id,
      channel: postCampaigns.channel,
      content: postCampaigns.content,
      status: postCampaigns.status,
      owner_user_id: jdHistory.user_id,
    })
    .from(postCampaigns)
    .innerJoin(jdHistory, eq(postCampaigns.jd_history_id, jdHistory.id))
    .where(eq(postCampaigns.id, campaignId))
    .limit(1)
  return rows[0] ?? null
}

export async function markCampaignStatus(
  campaignId: string,
  status: 'failed' | 'posted',
  extra?: { platform_post_id?: string; posted_at?: string },
): Promise<void> {
  await getDb()
    .update(postCampaigns)
    .set({ status, ...extra })
    .where(eq(postCampaigns.id, campaignId))
}
```

(`and` imported but unused above — remove it from the import line; only `eq` is needed. Double-check this when writing the file: `import { eq } from 'drizzle-orm'`.)

- [ ] **Step 5: Write `src/lib/db/connected-accounts.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { getDb } from './client'
import { connectedAccounts } from './schema'

export async function upsertConnectedAccount(values: {
  user_id: string
  platform: string
  access_token: string
  platform_user_id?: string | null
  platform_user_name?: string | null
  token_expires_at?: string
  facebook_pages?: Array<{ id: string; name: string; access_token: string }> | null
  selected_page_id?: string | null
}): Promise<void> {
  await getDb()
    .insert(connectedAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: [connectedAccounts.user_id, connectedAccounts.platform],
      set: values,
    })
}

export async function deleteConnectedAccount(userId: string, platform: string): Promise<void> {
  await getDb()
    .delete(connectedAccounts)
    .where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.platform, platform)))
}

export async function getConnectedAccountStatus(userId: string, platform: string) {
  const rows = await getDb()
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platform_user_id: connectedAccounts.platform_user_id,
      platform_user_name: connectedAccounts.platform_user_name,
      facebook_pages: connectedAccounts.facebook_pages,
      selected_page_id: connectedAccounts.selected_page_id,
      token_expires_at: connectedAccounts.token_expires_at,
    })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.platform, platform)))
    .limit(1)
  return rows[0] ?? null
}

export async function getConnectedAccountForPublish(userId: string, platform: string) {
  const rows = await getDb()
    .select({
      access_token: connectedAccounts.access_token,
      platform_user_id: connectedAccounts.platform_user_id,
      facebook_pages: connectedAccounts.facebook_pages,
      selected_page_id: connectedAccounts.selected_page_id,
    })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.platform, platform)))
    .limit(1)
  return rows[0] ?? null
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: all tests in `tests/db-post-campaigns.test.ts` and `tests/db-connected-accounts.test.ts` PASS.

- [ ] **Step 7: Commit both modules**

```bash
git add src/lib/db/post-campaigns.ts src/lib/db/connected-accounts.ts \
  tests/db-post-campaigns.test.ts tests/db-connected-accounts.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add post_campaigns and connected_accounts modules

getCampaignWithOwner replaces the Supabase-specific
`jd_history!inner(user_id)` embedded-join with an explicit innerJoin.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Rewire `src/app/api/post-job/campaigns/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { listCampaignsForJd, updateCampaignContent } from '@/lib/db/post-campaigns'

export async function GET(req: NextRequest) {
  const jd_history_id = req.nextUrl.searchParams.get('jd_id')

  if (!jd_history_id) {
    return NextResponse.json({ error: 'Thiếu jd_id' }, { status: 400 })
  }

  try {
    const data = await listCampaignsForJd(jd_history_id)
    return NextResponse.json({ campaigns: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { campaign_id, content } = await req.json() as { campaign_id: string; content: string }

  if (!campaign_id || !content) {
    return NextResponse.json({ error: 'Thiếu campaign_id hoặc content' }, { status: 400 })
  }

  try {
    await updateCampaignContent(campaign_id, content)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}
```

- [ ] **Step 9: Rewire the DB calls in `src/app/api/post-job/generate/route.ts`**

Keep every prompt-building function (`getCandidatePersona`, `pickStoryAngle`, `buildAngleDirective`, `buildAntiPatternBlock`, `buildReplyStarterPrompt`, `buildRecommendPrompt`, `STYLE_DESCRIPTIONS`, `CHANNEL_RULES`, `buildGeneratePrompt`) **verbatim, unchanged**. Only these 3 things change:

1. The import block at the top:

```ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@clerk/nextjs/server'
import { getJdTitleById } from '@/lib/db/jd-history'
import { getJdHistoryById } from '@/lib/db/jd-history'
import { getLatestQuestionnaireForJd, getLatestAnswerForQuestionnaire } from '@/lib/db/questionnaires'
import { upsertCampaignDraft } from '@/lib/db/post-campaigns'
import { checkRateLimit } from '@/lib/rate-limit'
import type { ContentStyle, ChannelRecommendation } from '@/lib/db/types'
import { callAnthropicWithFallback } from '@/lib/ai/models'
```

(`getJdTitleById` isn't actually used in this file — remove that duplicate import line; only `getJdHistoryById` is needed here since the route needs both `job_title` and `generated_jd`, not just the title.)

2. `fetchQuestionnaireContext`:

```ts
async function fetchQuestionnaireContext(jdHistoryId: string): Promise<string> {
  const q = await getLatestQuestionnaireForJd(jdHistoryId)
  if (!q) return ''

  const ans = await getLatestAnswerForQuestionnaire(q.id)
  if (!ans?.answers) return ''

  const a = ans.answers as Record<string, unknown>
  const lines: string[] = []

  if (a['req_1']) lines.push(`Yêu cầu kinh nghiệm: ${a['req_1']}`)

  if (Array.isArray(a['req_2'])) {
    const skills = (a['req_2'] as Array<{skill: string; level: string}>)
      .map(s => `${s.skill} (${s.level})`)
      .join(', ')
    lines.push(`Kỹ năng: ${skills}`)
  }

  if (a['pkg_2']) lines.push(`Điểm hấp dẫn của team: ${a['pkg_2']}`)
  if (a['usp_1']) lines.push(`Lý do ứng viên nên chọn: ${a['usp_1']}`)
  if (a['usp_2']) lines.push(`Cơ hội phát triển: ${a['usp_2']}`)
  if (a['usp_3']) lines.push(`Thách thức lớn nhất: ${a['usp_3']}`)

  if (a['pkg_1']) lines.push(`Lương: ${a['pkg_1']}`)

  return lines.join('\n')
}
```

3. Inside `POST`, replace the JD fetch and the campaign upsert:

```ts
    const jd = await getJdHistoryById(jd_history_id, {})

    if (!jd) {
      return NextResponse.json({ error: 'Không tìm thấy JD' }, { status: 404 })
    }
```

(same position as the original `jdError`/`jd` block — `jd.job_title` / `jd.generated_jd` usage further down stays identical since column names are unchanged)

```ts
      let campaign
      try {
        campaign = await upsertCampaignDraft({ jd_history_id, channel, content })
      } catch (err) {
        console.error('Upsert campaign error:', err)
        return NextResponse.json({ error: 'Lưu content thất bại' }, { status: 500 })
      }
```

(replaces the `.upsert(...).select().single()` block; everything after — the Threads reply-starter generation and the final `NextResponse.json({ campaign, replyStarters })` — stays unchanged.)

- [ ] **Step 10: Rewire `src/app/api/post-job/publish/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCampaignWithOwner, markCampaignStatus } from '@/lib/db/post-campaigns'
import { getConnectedAccountForPublish } from '@/lib/db/connected-accounts'
import { decrypt } from '@/lib/encryption'

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json() as { campaign_id: string }
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!campaign_id) {
    return NextResponse.json({ error: 'Thiếu campaign_id' }, { status: 400 })
  }

  const campaign = await getCampaignWithOwner(campaign_id)

  if (!campaign) {
    return NextResponse.json({ error: 'Không tìm thấy campaign' }, { status: 404 })
  }

  if (campaign.owner_user_id !== userId) {
    return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
  }

  if (campaign.status === 'posted') {
    return NextResponse.json({ error: 'Đã đăng rồi' }, { status: 400 })
  }

  const account = await getConnectedAccountForPublish(userId, campaign.channel)

  if (!account) {
    return NextResponse.json({ error: 'Chưa kết nối tài khoản' }, { status: 400 })
  }

  const token = decrypt(account.access_token)
  let platformPostId: string

  try {
    if (campaign.channel === 'linkedin') {
      platformPostId = await postToLinkedIn(token, account.platform_user_id ?? '', campaign.content)
    } else if (campaign.channel === 'facebook') {
      const pageToken = getPageToken(account)
      const pageId = account.selected_page_id
      if (!pageId || !pageToken) {
        return NextResponse.json({ error: 'Chưa chọn Facebook Page' }, { status: 400 })
      }
      platformPostId = await postToFacebook(pageToken, pageId, campaign.content)
    } else {
      return NextResponse.json({ error: 'Kênh này không hỗ trợ direct post' }, { status: 400 })
    }
  } catch (err) {
    console.error('Publish error:', err)
    await markCampaignStatus(campaign_id, 'failed')
    return NextResponse.json({ error: 'Lỗi khi đăng lên platform' }, { status: 502 })
  }

  await markCampaignStatus(campaign_id, 'posted', {
    platform_post_id: platformPostId,
    posted_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, platform_post_id: platformPostId })
}

function getPageToken(
  account: { facebook_pages: Array<{ id: string; access_token: string }> | null; selected_page_id: string | null }
): string | null {
  if (!account.facebook_pages || !account.selected_page_id) return null
  const page = account.facebook_pages.find(p => p.id === account.selected_page_id)
  if (!page) return null
  return decrypt(page.access_token)
}

async function postToLinkedIn(token: string, personSub: string, content: string): Promise<string> {
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${personSub}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LinkedIn API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}

async function postToFacebook(pageToken: string, pageId: string, content: string): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: content,
      access_token: pageToken,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Facebook API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}
```

- [ ] **Step 11: Rewire `src/app/api/auth/[platform]/callback/route.ts`**

Only the two `.upsert(...)` blocks and the top import change; everything else (OAuth token exchange fetches) stays verbatim:

```ts
import { upsertConnectedAccount } from '@/lib/db/connected-accounts'
```

(replaces `import { getSupabaseAdmin } from '@/lib/supabase'`)

In `handleLinkedIn`, replace the upsert block with:

```ts
  await upsertConnectedAccount({
    user_id: userId,
    platform: 'linkedin',
    access_token: encrypt(tokenData.access_token),
    token_expires_at: expiresAt,
    platform_user_id: profile.sub,
    platform_user_name: profile.name,
  })
```

In `handleFacebook`, replace the upsert block with:

```ts
  await upsertConnectedAccount({
    user_id: userId,
    platform: 'facebook',
    access_token: encrypt(longData.access_token),
    token_expires_at: expiresAt,
    platform_user_id: me.id,
    platform_user_name: me.name,
    facebook_pages: pages.map(p => ({
      id: p.id,
      name: p.name,
      access_token: encrypt(p.access_token),
    })),
    selected_page_id: pages[0]?.id ?? null,
  })
```

- [ ] **Step 12: Rewire `src/app/api/auth/[platform]/disconnect/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { deleteConnectedAccount } from '@/lib/db/connected-accounts'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await deleteConnectedAccount(userId, platform)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'DB error' }, { status: 500 })
  }
}
```

- [ ] **Step 13: Rewire `src/app/api/auth/[platform]/status/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getConnectedAccountStatus } from '@/lib/db/connected-accounts'
import type { ConnectedAccount } from '@/lib/db/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await getConnectedAccountStatus(userId, platform)

  return NextResponse.json({
    connected: !!data,
    account: data as ConnectedAccount | null,
  })
}
```

- [ ] **Step 14: Commit route rewiring**

```bash
git add src/app/api/post-job src/app/api/auth
git commit -m "$(cat <<'EOF'
refactor: rewire post-job and social-auth routes to Drizzle modules

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `feedback` module + rewire feedback route + admin page

**Files:**
- Create: `src/lib/db/feedback.ts`
- Test: `tests/db-feedback.test.ts`
- Modify: `src/app/api/feedback/route.ts`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import { insertFeedback, listFeedback } from '@/lib/db/feedback'
import { feedback } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

test('insertFeedback + listFeedback round-trip', async () => {
  await insertFeedback({ user_id: 'fb_test_user', email: 'fb@test.dev', message: 'test message' })
  try {
    const rows = await listFeedback()
    const found = rows.find((r) => r.message === 'test message')
    assert.ok(found)
    assert.equal(found?.email, 'fb@test.dev')
  } finally {
    await testDb.delete(feedback).where(eq(feedback.user_id, 'fb_test_user'))
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '@/lib/db/feedback'`.

- [ ] **Step 3: Write `src/lib/db/feedback.ts`**

```ts
import { desc } from 'drizzle-orm'
import { getDb } from './client'
import { feedback } from './schema'

export async function insertFeedback(values: {
  user_id: string
  email: string | null
  message: string
}): Promise<void> {
  await getDb().insert(feedback).values(values)
}

export async function listFeedback() {
  return getDb()
    .select({ id: feedback.id, email: feedback.email, message: feedback.message, created_at: feedback.created_at })
    .from(feedback)
    .orderBy(desc(feedback.created_at))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit the module**

```bash
git add src/lib/db/feedback.ts tests/db-feedback.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add feedback data-access module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Rewire `src/app/api/feedback/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { insertFeedback } from '@/lib/db/feedback'

export async function POST(req: NextRequest) {
  const { message, email } = await req.json()
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Thiếu nội dung feedback' }, { status: 400 })
  }

  try {
    await insertFeedback({ user_id: email ?? 'anonymous', email: email ?? null, message: message.trim() })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feedback insert error:', err)
    return NextResponse.json({ error: 'Lỗi lưu feedback' }, { status: 500 })
  }
}
```

- [ ] **Step 7: Rewire `src/app/admin/page.tsx`**

```tsx
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { listFeedback } from '@/lib/db/feedback'

const ADMIN_EMAIL = 'jane.nguyen@onearw.com'

export default async function AdminPage() {
  const user = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress

  if (email !== ADMIN_EMAIL) redirect('/app')

  let feedbacks: Awaited<ReturnType<typeof listFeedback>> = []
  try {
    feedbacks = await listFeedback()
  } catch (err) {
    console.error('listFeedback failed:', err)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
            <p className="text-sm text-gray-400 mt-1">{feedbacks.length} góp ý</p>
          </div>
          <a href="/app" className="text-sm text-indigo-600 hover:underline">← Về trang chính</a>
        </div>

        {feedbacks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            Chưa có feedback nào.
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map((fb) => (
              <div key={fb.id} className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-indigo-600">{fb.email ?? 'Ẩn danh'}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(fb.created_at).toLocaleString('vi-VN', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

(The local `FeedbackRow` type is dropped since `listFeedback()`'s return type already gives the same shape via inference.)

- [ ] **Step 8: Commit**

```bash
git add src/app/api/feedback/route.ts src/app/admin/page.tsx
git commit -m "$(cat <<'EOF'
refactor: rewire feedback route and admin page to Drizzle module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `api_usage` module + rewire `rate-limit.ts`

**Files:**
- Create: `src/lib/db/api-usage.ts`
- Test: `tests/db-api-usage.test.ts`
- Test: `tests/rate-limit.test.ts`
- Modify: `src/lib/rate-limit.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/db-api-usage.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import { countUsageSince, insertUsage } from '@/lib/db/api-usage'
import { apiUsage } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanup(userId: string, endpoint: string) {
  await testDb.delete(apiUsage).where(and(eq(apiUsage.user_id, userId), eq(apiUsage.endpoint, endpoint)))
}

test('insertUsage then countUsageSince counts it', async () => {
  const userId = 'usage_user_1'
  const endpoint = 'generate'
  try {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const before = await countUsageSince(userId, endpoint, startOfDay)
    await insertUsage(userId, endpoint)
    const after = await countUsageSince(userId, endpoint, startOfDay)

    assert.equal(after, before + 1)
  } finally {
    await cleanup(userId, endpoint)
  }
})

test('countUsageSince ignores calls before the cutoff', async () => {
  const userId = 'usage_user_2'
  const endpoint = 'generate'
  try {
    await insertUsage(userId, endpoint)
    const future = new Date(Date.now() + 60_000)
    const count = await countUsageSince(userId, endpoint, future)
    assert.equal(count, 0)
  } finally {
    await cleanup(userId, endpoint)
  }
})
```

```ts
// tests/rate-limit.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit } from '@/lib/rate-limit'
import { createDb } from '@/lib/db/client'
import { apiUsage } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

test('checkRateLimit allows under the limit and blocks at it', async () => {
  const userId = 'rl_user_1'
  try {
    // 'recruiting-leads' has the lowest DAILY_LIMITS entry (10), cheapest to exhaust in a test
    for (let i = 0; i < 10; i++) {
      const { allowed } = await checkRateLimit(userId, 'recruiting-leads')
      assert.equal(allowed, true, `call ${i} should be allowed`)
    }
    const { allowed, remaining } = await checkRateLimit(userId, 'recruiting-leads')
    assert.equal(allowed, false)
    assert.equal(remaining, 0)
  } finally {
    await testDb.delete(apiUsage).where(eq(apiUsage.user_id, userId))
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '@/lib/db/api-usage'`, and `rate-limit.test.ts` fails too since `rate-limit.ts` still imports the (about to be deleted) `@/lib/supabase`.

- [ ] **Step 3: Write `src/lib/db/api-usage.ts`**

```ts
import { and, eq, gte, sql } from 'drizzle-orm'
import { getDb } from './client'
import { apiUsage } from './schema'

export async function countUsageSince(userId: string, endpoint: string, since: Date): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(apiUsage)
    .where(and(eq(apiUsage.user_id, userId), eq(apiUsage.endpoint, endpoint), gte(apiUsage.called_at, since)))
  return rows[0].count
}

export async function insertUsage(userId: string, endpoint: string): Promise<void> {
  await getDb().insert(apiUsage).values({ user_id: userId, endpoint })
}
```

- [ ] **Step 4: Rewrite `src/lib/rate-limit.ts` in place (exported signature unchanged)**

```ts
import { countUsageSince, insertUsage } from '@/lib/db/api-usage'

const DAILY_LIMITS: Record<string, number> = {
  generate: 10,
  'post-job/generate': 20,
  'recruiting-chat': 50,
  'recruiting-leads': 10,
}

export async function checkRateLimit(
  userId: string,
  endpoint: string
): Promise<{ allowed: boolean; remaining: number }> {
  const limit = DAILY_LIMITS[endpoint] ?? 10

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  // Intentional fail-open: if the DB is unreachable, don't block the user's
  // request over a rate-limit check they can't control. Previously this was
  // an accidental side effect of an unchecked Supabase error; now it's a
  // logged, deliberate decision.
  let used = 0
  try {
    used = await countUsageSince(userId, endpoint, startOfDay)
  } catch (err) {
    console.error('checkRateLimit: countUsageSince failed, failing open:', err)
  }

  const allowed = used < limit

  if (allowed) {
    try {
      await insertUsage(userId, endpoint)
    } catch (err) {
      console.error('checkRateLimit: insertUsage failed:', err)
    }
  }

  return { allowed, remaining: Math.max(0, limit - used - (allowed ? 1 : 0)) }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: all tests in `tests/db-api-usage.test.ts` and `tests/rate-limit.test.ts` PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/api-usage.ts src/lib/rate-limit.ts tests/db-api-usage.test.ts tests/rate-limit.test.ts
git commit -m "$(cat <<'EOF'
refactor: rewrite rate-limit.ts on Drizzle, make fail-open explicit

Previously an unchecked Supabase query error silently made count=0
(fail open). Same behavior, now caught and logged intentionally
instead of happening by accident.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Rewrite `src/lib/recruiting-rag/db.ts` in place (recruiting_chat_* + recruiting_leads)

**Files:**
- Modify: `src/lib/recruiting-rag/db.ts`
- Test: `tests/db-recruiting-rag.test.ts`

This file's exported functions (`getOrCreateRecruitingConversation`, `saveRecruitingChatMessage`, `saveRecruitingLead`) are called from `src/app/api/recruiting-chat/route.ts` and `src/app/api/recruiting-leads/route.ts` — **not** in this plan's 24-file scope. Keep the exact same exported names and parameter/return shapes so those callers need zero changes.

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '@/lib/db/client'
import {
  getOrCreateRecruitingConversation,
  saveRecruitingChatMessage,
  saveRecruitingLead,
} from '@/lib/recruiting-rag/db'
import { recruitingChatConversations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const testDb = createDb(process.env.TEST_DATABASE_URL!)

async function cleanupConversation(id: string) {
  // cascades to recruiting_chat_messages and sets recruiting_leads.conversation_id to null
  await testDb.delete(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
}

test('getOrCreateRecruitingConversation creates when no id given, reuses when given', async () => {
  const id = await getOrCreateRecruitingConversation({ userId: 'rag_user_1', userEmail: 'rag@test.dev' })
  try {
    assert.ok(id)
    const reused = await getOrCreateRecruitingConversation({ conversationId: id, userId: 'rag_user_1' })
    assert.equal(reused, id)
  } finally {
    await cleanupConversation(id)
  }
})

test('getOrCreateRecruitingConversation backfills user_email on an old conversation', async () => {
  const id = await getOrCreateRecruitingConversation({ userId: 'rag_user_2' })
  try {
    const rows1 = await testDb.select().from(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
    assert.equal(rows1[0].user_email, null)

    await getOrCreateRecruitingConversation({ conversationId: id, userId: 'rag_user_2', userEmail: 'later@test.dev' })
    const rows2 = await testDb.select().from(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
    assert.equal(rows2[0].user_email, 'later@test.dev')
  } finally {
    await cleanupConversation(id)
  }
})

test('saveRecruitingChatMessage inserts the message and bumps updated_at atomically', async () => {
  const id = await getOrCreateRecruitingConversation({ userId: 'rag_user_3' })
  try {
    const before = await testDb.select().from(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
    await new Promise((r) => setTimeout(r, 10))
    await saveRecruitingChatMessage({
      conversation_id: id,
      role: 'user',
      content: 'hello',
      used_chunk_ids: [],
      sources: [],
    })
    const after = await testDb.select().from(recruitingChatConversations).where(eq(recruitingChatConversations.id, id))
    assert.ok(new Date(after[0].updated_at) > new Date(before[0].updated_at))
  } finally {
    await cleanupConversation(id)
  }
})

test('saveRecruitingLead inserts and returns the id', async () => {
  const convId = await getOrCreateRecruitingConversation({ userId: 'rag_user_4' })
  try {
    const leadId = await saveRecruitingLead({
      userId: 'rag_user_4',
      payload: {
        email: 'lead@test.dev',
        phone: '0912345678',
        name: 'Test Lead',
        company: null,
        hiringNeed: null,
        conversationId: convId,
      },
    })
    assert.ok(leadId)
  } finally {
    await cleanupConversation(convId)
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `db.ts` still imports `getSupabaseAdmin` from `@/lib/supabase`, which is unchanged so far, but the test itself compiles against the eventual behavior; more precisely it'll fail because nothing is broken yet — run this step for real only after confirming the test fails against the *old* implementation for the wrong reason is not expected. Since `db.ts` isn't changed yet, these tests should actually all PASS against the untouched Supabase-backed implementation if `TEST_DATABASE_URL`'s Supabase equivalent doesn't exist — but it does exist as Neon here, so instead this step's real signal is: run the tests now, before editing `db.ts`, and confirm they fail with a Supabase auth/connection error (since `db.ts` still points at `SUPABASE_SERVICE_ROLE_KEY`/Supabase, not the Neon dev branch) — proving the tests actually exercise real behavior, not a no-op.

- [ ] **Step 3: Rewrite `src/lib/recruiting-rag/db.ts`**

```ts
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { recruitingChatConversations, recruitingChatMessages, recruitingLeads } from '@/lib/db/schema'
import {
  buildConversationInsertPayload,
  type NormalizedLeadPayload,
  type RecruitingChatMessageInsert,
} from './persistence'

export async function getOrCreateRecruitingConversation({
  conversationId,
  userId,
  userEmail,
}: {
  conversationId?: string | null
  userId: string
  userEmail?: string | null
}): Promise<string> {
  const db = getDb()

  if (conversationId) {
    const rows = await db
      .select({ id: recruitingChatConversations.id, user_email: recruitingChatConversations.user_email })
      .from(recruitingChatConversations)
      .where(eq(recruitingChatConversations.id, conversationId))
      .limit(1)
    const existing = rows[0]

    if (existing && existing.id === conversationId) {
      const rowsMatchingUser = await db
        .select({ id: recruitingChatConversations.id })
        .from(recruitingChatConversations)
        .where(eq(recruitingChatConversations.id, conversationId))
        .limit(1)
      if (rowsMatchingUser[0]) {
        if (userEmail?.trim() && !existing.user_email) {
          await db
            .update(recruitingChatConversations)
            .set({ user_email: userEmail.trim() })
            .where(eq(recruitingChatConversations.id, existing.id))
        }
        return String(existing.id)
      }
    }
  }

  const id = crypto.randomUUID()
  const rows = await db
    .insert(recruitingChatConversations)
    .values(buildConversationInsertPayload({ id, userId, userEmail }))
    .returning({ id: recruitingChatConversations.id })

  return rows[0]?.id ? String(rows[0].id) : id
}

export async function saveRecruitingChatMessage(input: RecruitingChatMessageInsert) {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.insert(recruitingChatMessages).values(input)
    await tx
      .update(recruitingChatConversations)
      .set({ updated_at: new Date().toISOString() })
      .where(eq(recruitingChatConversations.id, input.conversation_id))
  })
}

export async function saveRecruitingLead({
  userId,
  payload,
}: {
  userId: string
  payload: NormalizedLeadPayload
}) {
  const rows = await getDb()
    .insert(recruitingLeads)
    .values({
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
    .returning({ id: recruitingLeads.id })

  return String(rows[0].id)
}
```

Note: the original code's `.eq('id', conversationId).eq('user_id', userId)` double-filter (ownership check baked into the WHERE clause) is simplified above to filter by `id` only, then treat "not found" the same as "not owned" — **this is a behavior simplification worth flagging explicitly**: the original silently fell through to creating a *new* conversation if the given `conversationId` existed but belonged to a different `userId` (since the `.eq('user_id', userId)` filter would make Supabase return 0 rows, `data` would be null, and the function would proceed past the `if (data?.id)` block to the create-new path). Preserve that exact fallback behavior by filtering on both columns in the lookup, not just `id`:

```ts
  if (conversationId) {
    const rows = await db
      .select({ id: recruitingChatConversations.id, user_email: recruitingChatConversations.user_email })
      .from(recruitingChatConversations)
      .where(
        and(eq(recruitingChatConversations.id, conversationId), eq(recruitingChatConversations.user_id, userId)),
      )
      .limit(1)
    const existing = rows[0]

    if (existing) {
      if (userEmail?.trim() && !existing.user_email) {
        await db
          .update(recruitingChatConversations)
          .set({ user_email: userEmail.trim() })
          .where(and(eq(recruitingChatConversations.id, existing.id), eq(recruitingChatConversations.user_id, userId)))
      }
      return String(existing.id)
    }
  }
```

(replace the earlier draft of this block with this corrected version — remember to add `and` to the `drizzle-orm` import: `import { and, eq } from 'drizzle-orm'`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: all 4 tests in `tests/db-recruiting-rag.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruiting-rag/db.ts tests/db-recruiting-rag.test.ts
git commit -m "$(cat <<'EOF'
refactor: rewrite recruiting-rag/db.ts on Drizzle

Exported function signatures unchanged so recruiting-chat and
recruiting-leads routes (out of migration scope) need no edits.
saveRecruitingChatMessage now wraps insert+touch in a transaction.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Health check, `/status` page, health script — rename Supabase→Neon; remove keepalive

**Files:**
- Modify: `src/lib/health/check.ts`
- Modify: `src/app/status/page.tsx`
- Modify: `scripts/health.ts`
- Modify: `tests/health-check.test.ts`
- Delete: `src/app/api/keepalive/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Update the failing test first**

`tests/health-check.test.ts` already tests `aggregateHealth` with an injected map of check functions keyed `{ supabase, anthropic, clerk }`. Update the key to `neon`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateHealth, type CheckResult } from '@/lib/health/check'

const ok = (): Promise<CheckResult> => Promise.resolve({ ok: true, ms: 5 })
const bad = (): Promise<CheckResult> => Promise.resolve({ ok: false, ms: 5, error: 'boom' })

test('overall green when all checks pass', async () => {
  const r = await aggregateHealth({ neon: ok, anthropic: ok, clerk: ok })
  assert.equal(r.overall, 'green')
  assert.equal(r.checks.neon.ok, true)
  assert.ok(typeof r.at === 'string')
})

test('overall red when any check fails', async () => {
  const r = await aggregateHealth({ neon: ok, anthropic: bad, clerk: ok })
  assert.equal(r.overall, 'red')
  assert.equal(r.checks.anthropic.error, 'boom')
})

test('a hanging check is reported failed, not left hanging', async () => {
  const hang = () => new Promise<CheckResult>(() => {}) // never resolves
  const r = await aggregateHealth(
    { neon: ok, anthropic: hang, clerk: ok },
    { timeoutMs: 50 },
  )
  assert.equal(r.overall, 'red')
  assert.equal(r.checks.anthropic.ok, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — TypeScript error, `neon` doesn't exist on the `checks` param type yet (`check.ts` still says `supabase`).

- [ ] **Step 3: Rewrite `src/lib/health/check.ts`**

```ts
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
```

- [ ] **Step 4: Update `src/app/status/page.tsx`** (key rename only)

```tsx
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
```

- [ ] **Step 5: Update `scripts/health.ts`** (key rename only)

```ts
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: all tests in `tests/health-check.test.ts` PASS.

- [ ] **Step 7: Delete the keepalive route and its cron entry**

```bash
git rm src/app/api/keepalive/route.ts
```

Edit `vercel.json` to remove the `crons` block entirely (no other cron takes its place yet — Phase 2 of the reliability plan, which is out of scope here, will add one later):

```json
{}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/health/check.ts src/app/status/page.tsx scripts/health.ts tests/health-check.test.ts vercel.json
git commit -m "$(cat <<'EOF'
refactor(health): rename Supabase check to Neon; remove keepalive cron

Neon's free tier auto-suspends compute on idle but auto-wakes on the
next query with no dashboard action needed, unlike Supabase's hard
pause — no keepalive ping is needed to prevent it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Rewire `src/app/api/reminders/route.ts` (also fixes the N+1)

**Files:**
- Modify: `src/app/api/reminders/route.ts`
- Modify: `src/lib/db/questionnaires.ts` (add 2 batch-lookup functions)
- Test: `tests/db-questionnaires.test.ts` (add 2 tests)

- [ ] **Step 1: Add failing tests for the new batch functions**

Append to `tests/db-questionnaires.test.ts`:

```ts
test('getLatestQuestionnairesForJds returns the latest questionnaire per jd id', async () => {
  const jdA = await insertJdHistory({ job_title: 'Batch A', raw_input: 'r', generated_jd: 'g', user_id: 'batch_user' })
  const jdB = await insertJdHistory({ job_title: 'Batch B', raw_input: 'r', generated_jd: 'g', user_id: 'batch_user' })
  try {
    const qA1 = await insertQuestionnaire({ jd_history_id: jdA.id, questions: [], prefilled_answers: {}, language: 'vi' })
    await new Promise((r) => setTimeout(r, 10))
    const qA2 = await insertQuestionnaire({ jd_history_id: jdA.id, questions: [], prefilled_answers: {}, language: 'vi', is_resend: true })
    const qB1 = await insertQuestionnaire({ jd_history_id: jdB.id, questions: [], prefilled_answers: {}, language: 'vi' })

    const { getLatestQuestionnairesForJds } = await import('@/lib/db/questionnaires')
    const map = await getLatestQuestionnairesForJds([jdA.id, jdB.id])
    assert.equal(map.get(jdA.id)?.id, qA2.id)
    assert.equal(map.get(jdB.id)?.id, qB1.id)
    void qA1
  } finally {
    await cleanupJd(jdA.id)
    await cleanupJd(jdB.id)
  }
})

test('getLatestAnswersForQuestionnaires returns the latest answer per questionnaire id', async () => {
  const jd = await insertJdHistory({ job_title: 'Batch Ans', raw_input: 'r', generated_jd: 'g', user_id: 'batch_user' })
  try {
    const q = await insertQuestionnaire({ jd_history_id: jd.id, questions: [], prefilled_answers: {}, language: 'vi' })
    await insertQuestionnaireAnswerAndMarkAnswered(q.id, { a: 1 })

    const { getLatestAnswersForQuestionnaires } = await import('@/lib/db/questionnaires')
    const map = await getLatestAnswersForQuestionnaires([q.id])
    assert.deepEqual(map.get(q.id)?.answers, { a: 1 })
  } finally {
    await cleanupJd(jd.id)
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `getLatestQuestionnairesForJds`/`getLatestAnswersForQuestionnaires` don't exist yet.

- [ ] **Step 3: Add the two batch functions to `src/lib/db/questionnaires.ts`**

```ts
import { desc, eq, inArray } from 'drizzle-orm'
```

(update the existing import line to add `inArray`)

```ts
export async function getLatestQuestionnairesForJds(
  jdHistoryIds: string[],
): Promise<Map<string, typeof questionnaires.$inferSelect>> {
  if (jdHistoryIds.length === 0) return new Map()
  const rows = await getDb()
    .select()
    .from(questionnaires)
    .where(inArray(questionnaires.jd_history_id, jdHistoryIds))
    .orderBy(desc(questionnaires.created_at))
  const map = new Map<string, typeof questionnaires.$inferSelect>()
  for (const row of rows) {
    if (row.jd_history_id && !map.has(row.jd_history_id)) map.set(row.jd_history_id, row)
  }
  return map
}

export async function getLatestAnswersForQuestionnaires(
  questionnaireIds: string[],
): Promise<Map<string, typeof questionnaireAnswers.$inferSelect>> {
  if (questionnaireIds.length === 0) return new Map()
  const rows = await getDb()
    .select()
    .from(questionnaireAnswers)
    .where(inArray(questionnaireAnswers.questionnaire_id, questionnaireIds))
    .orderBy(desc(questionnaireAnswers.submitted_at))
  const map = new Map<string, typeof questionnaireAnswers.$inferSelect>()
  for (const row of rows) {
    if (row.questionnaire_id && !map.has(row.questionnaire_id)) map.set(row.questionnaire_id, row)
  }
  return map
}
```

(Relies on Postgres preserving `ORDER BY` before the JS reduction sees rows — true here since no intermediate re-sort happens.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Rewrite `src/app/api/reminders/route.ts`**

```ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { listActiveJdHistoryForUser } from '@/lib/db/jd-history'
import { getLatestQuestionnairesForJds, getLatestAnswersForQuestionnaires } from '@/lib/db/questionnaires'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let jds: Awaited<ReturnType<typeof listActiveJdHistoryForUser>>
  try {
    jds = await listActiveJdHistoryForUser(userId)
  } catch (err) {
    console.error('listActiveJdHistoryForUser failed:', err)
    return NextResponse.json({ reminders: [] })
  }

  const jdIds = jds.map((jd) => jd.id)
  const latestQByJd = await getLatestQuestionnairesForJds(jdIds)
  const questionnaireIds = [...latestQByJd.values()].map((q) => q.id)
  const latestAnsByQ = await getLatestAnswersForQuestionnaires(questionnaireIds)

  const reminders: { jd_history_id: string; job_title: string }[] = []

  for (const jd of jds) {
    const latestQ = latestQByJd.get(jd.id)
    if (!latestQ) continue
    if (latestQ.status === 'pending') continue

    const latestAns = latestAnsByQ.get(latestQ.id)
    if (!latestAns?.submitted_at) continue

    const age = Date.now() - new Date(latestAns.submitted_at).getTime()
    if (age >= THIRTY_DAYS_MS) {
      reminders.push({ jd_history_id: jd.id, job_title: jd.job_title })
    }
  }

  return NextResponse.json({ reminders })
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/questionnaires.ts tests/db-questionnaires.test.ts src/app/api/reminders/route.ts
git commit -m "$(cat <<'EOF'
refactor: rewire reminders route, fix N+1 with 2 batch queries

Previously ran 2 extra queries per active JD in a loop; now runs 3
queries total regardless of how many JDs a user has.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update the 6 type-only importers

**Files:**
- Modify: `src/app/app/page.tsx`
- Modify: `src/app/q/[token]/page.tsx`
- Modify: `src/components/ChannelPostBlock.tsx`
- Modify: `src/components/PostingCard.tsx`
- Modify: `src/components/QuestionnaireSummary.tsx`
- Modify: `src/components/QuestionnaireWizard.tsx`

These 6 files only import **types** from `@/lib/supabase` (no `getSupabaseAdmin()` calls) — confirmed by grep in the prerequisite research. Each needs exactly one import line changed; no other code in these files changes since field names (snake_case) are unchanged by this migration.

- [ ] **Step 1: Update each import line**

In `src/app/app/page.tsx`, change:
```ts
import { JdHistory } from '@/lib/supabase'
```
to:
```ts
import type { JdHistory } from '@/lib/db/types'
```

In `src/app/q/[token]/page.tsx`, change:
```ts
import { Question } from '@/lib/supabase'
```
to:
```ts
import type { Question } from '@/lib/db/types'
```

In `src/components/ChannelPostBlock.tsx`, change:
```ts
import type { ContentStyle, PostCampaign, ConnectedAccount } from '@/lib/supabase'
```
to:
```ts
import type { ContentStyle, PostCampaign, ConnectedAccount } from '@/lib/db/types'
```

In `src/components/PostingCard.tsx`, change:
```ts
import type { ConnectedAccount, PostCampaign, ChannelRecommendation } from '@/lib/supabase'
```
to:
```ts
import type { ConnectedAccount, PostCampaign, ChannelRecommendation } from '@/lib/db/types'
```

In `src/components/QuestionnaireSummary.tsx`, change:
```ts
import type { Question } from '@/lib/supabase'
```
to:
```ts
import type { Question } from '@/lib/db/types'
```

In `src/components/QuestionnaireWizard.tsx`, change:
```ts
import { Question } from '@/lib/supabase'
```
to:
```ts
import type { Question } from '@/lib/db/types'
```

- [ ] **Step 2: Type-check the whole project**

```bash
npx tsc --noEmit
```

Expected: no errors referencing `@/lib/supabase` or these 6 files. (Errors elsewhere referencing `@/lib/supabase` mean an earlier task's route rewiring was missed — go back and fix before continuing.)

- [ ] **Step 3: Commit**

```bash
git add src/app/app/page.tsx "src/app/q/[token]/page.tsx" src/components/ChannelPostBlock.tsx \
  src/components/PostingCard.tsx src/components/QuestionnaireSummary.tsx src/components/QuestionnaireWizard.tsx
git commit -m "$(cat <<'EOF'
refactor: point remaining type-only imports at @/lib/db/types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Delete `src/lib/supabase.ts` and the `@supabase/supabase-js` dependency

**Files:**
- Delete: `src/lib/supabase.ts`
- Modify: `package.json`

- [ ] **Step 1: Confirm nothing still imports it**

```bash
grep -rln "from '@/lib/supabase'" src --include="*.ts" --include="*.tsx"
```

Expected: **no output**. If anything prints, STOP — go back and finish rewiring that file before deleting anything.

- [ ] **Step 2: Delete the file**

```bash
git rm src/lib/supabase.ts
```

- [ ] **Step 3: Remove the npm dependency**

```bash
npm uninstall @supabase/supabase-js
```

- [ ] **Step 4: Full verification pass**

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
```

Expected: all four succeed with no errors. `npm run build` in particular catches any remaining Next.js route/page that still imports the now-deleted file (type-check alone can miss dynamic import edge cases).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: remove src/lib/supabase.ts and @supabase/supabase-js

All 24 call sites + 6 type-only importers now use src/lib/db/*.
This completes the code-side migration off Supabase; data migration
and cutover happen in the next two tasks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Data migration — dump prod Supabase, import into Neon `main`

This is the first task that touches the real prod Supabase database (read-only dump) and the real Neon `main` branch (writes). Everything up to here has only touched the Neon `dev` branch and local test runs.

**Files:** none (operational task, no code changes)

- [ ] **Step 1: Apply the Drizzle migration to Neon `main`**

```bash
DATABASE_URL="<neon main branch connection string>" npm run db:migrate
```

Verify with the same `information_schema.tables` query as Task 3 Step 3, run against `main` this time — expect the same 10 table names.

- [ ] **Step 2: Get a direct (non-pooled) Postgres connection string for Supabase**

Supabase dashboard → your project → Connect → "Connection string" (URI, not the pooled/transaction-mode one — use "Session" mode or the direct connection for `pg_dump` reliability). This is different from the `SUPABASE_SERVICE_ROLE_KEY`/REST URL already in `.env.local` — it's a real `postgres://` connection string, found in the dashboard, not currently stored anywhere in this repo.

- [ ] **Step 3: Dump data only from the 10 tables (no schema, no Supabase-internal tables)**

```bash
pg_dump "<supabase direct connection string>" \
  --data-only \
  --no-owner --no-privileges \
  -t public.jd_history -t public.questionnaires -t public.questionnaire_answers \
  -t public.post_campaigns -t public.connected_accounts -t public.feedback -t public.api_usage \
  -t public.recruiting_chat_conversations -t public.recruiting_chat_messages -t public.recruiting_leads \
  > /tmp/jane-ai-data-dump.sql
```

If `pg_dump`/`psql` aren't installed locally, install via `brew install postgresql` (macOS) first — do not skip straight to a GUI tool, since the exact table list and `--data-only` flag matter for correctness (a full dump would try to recreate Supabase-specific `auth`/`storage` schemas that don't exist and shouldn't exist on Neon).

- [ ] **Step 4: Restore into Neon `main`**

```bash
psql "<neon main branch connection string>" < /tmp/jane-ai-data-dump.sql
```

- [ ] **Step 5: Verify row counts match**

For each of the 10 tables, compare counts:

```bash
for t in jd_history questionnaires questionnaire_answers post_campaigns connected_accounts feedback api_usage recruiting_chat_conversations recruiting_chat_messages recruiting_leads; do
  echo -n "$t: supabase="
  psql "<supabase direct connection string>" -t -c "select count(*) from $t"
  echo -n "$t: neon="
  psql "<neon main branch connection string>" -t -c "select count(*) from $t"
done
```

Expected: every table's two counts match exactly. If any table mismatches, do not proceed to Task 16 — investigate (a common cause: a table had rows inserted on Supabase *after* the dump was taken, e.g. if hours passed between Step 3 and now — re-dump that table and re-import just its rows).

- [ ] **Step 6: Delete the local dump file (contains real user data)**

```bash
rm /tmp/jane-ai-data-dump.sql
```

No commit for this task — it's a one-time data operation, not a code change.

---

## Task 16: Cutover — env vars, deploy, prod smoke test

**Files:** none (deployment operation)

- [ ] **Step 1: Add `DATABASE_URL` to Vercel**

In the Vercel dashboard for the `jane-ai` project → Settings → Environment Variables, add `DATABASE_URL` = the Neon `main` branch **pooled** connection string, scoped to Production (and Preview if you want preview deploys to also use Neon — recommend yes, so preview builds don't silently touch Supabase after Task 14 removed the Supabase client anyway).

Do **not** remove `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from Vercel yet — they're unused by the app after Task 14 but keeping them costs nothing and there's no reason to touch them during the cutover itself.

- [ ] **Step 2: Deploy**

```bash
git push origin main
```

Watch the Vercel deployment (dashboard or `vercel` CLI) until it's live. This is the moment downtime begins (previous deploy still serving traffic until this one is ready, so actual downtime is close to zero — Vercel does atomic cutover between deployments, not a teardown-then-rebuild).

- [ ] **Step 3: Smoke test immediately after deploy**

```bash
npm run health
```

Expected: `🟢 neon`, `🟢 anthropic`, `🟢 clerk`, `🟢 OVERALL: GREEN`.

- [ ] **Step 4: Manual smoke test of 2-3 real flows on prod**

Open `https://ai.bebetterwithjane.com/app`, log in, and:
1. Create a new JD (exercises `insertJdHistory` + AI call).
2. Open `/api/history` (exercises `listJdHistory`).
3. If time allows, generate a questionnaire and submit an answer (exercises the transactional `insertQuestionnaireAnswerAndMarkAnswered`).

Confirm each returns real data with no 500s, and check the new row actually appears when re-querying (e.g. refresh history list).

- [ ] **Step 5: Check Vercel function logs for the first ~10 minutes post-deploy**

Look for any unhandled errors mentioning `drizzle`, `neon`, or a stack trace touching `src/lib/db/*` — these would indicate a query that wasn't exercised by the manual smoke test above but got hit by real traffic.

No commit for this task.

---

## Task 17: Post-cutover cleanup (do this ~2 weeks later, once nothing has broken)

**Files:** none (operational)

This task is deliberately **not** done immediately after Task 16 — the design spec calls for keeping the Supabase project alive as a rollback net for about 2 weeks. Revisit this plan after that window:

- [ ] Confirm no rollback was needed (no revert-to-Supabase deploy happened in the interim).
- [ ] In Vercel, remove the now-unused `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` env vars.
- [ ] Let the Supabase project pause naturally (do nothing — free tier auto-pauses after 7 days idle, which is fine now since nothing depends on it) or delete it outright from the Supabase dashboard if you want it gone immediately.
- [ ] Update stale memory: the memories `supabase-keepalive-free-tier`, `local-dev-hits-prod-supabase`, and `recruiting-migrations-applied-prod` all describe a Supabase-based setup that no longer exists — replace or remove them (this is a memory-system edit, not a code change; do it in a Claude Code session, not via this repo's git history).

---

## Self-review notes (from the writing-plans skill's required self-check)

- **Spec coverage:** every section of `docs/superpowers/specs/2026-09-16-neon-drizzle-migration-design.md` is covered — architecture (Tasks 1-4), schema (Task 2), Drizzle-vs-raw-SQL decision (addressed in the plan header), migration/cutover plan (Tasks 15-16), cleanup (Tasks 11, 14, 17), testing (every module task includes tests run against the Neon dev branch), rollback (Task 17's 2-week wait + Task 16 keeping old env vars).
- **Placeholder scan:** no "TBD"/"add error handling"/"similar to Task N" phrases; every code-bearing step shows the actual code, including the two files (`post-job/generate/route.ts`, `recruiting-rag/db.ts`) where only part of a large file changes — those steps show the exact replacement blocks with enough surrounding context (function names, position) to locate them unambiguously.
- **Type consistency:** `checkRateLimit(userId, endpoint)` signature unchanged from the original (Task 9) so `recruiting-chat`/`recruiting-leads` routes outside scope keep working; `getOrCreateRecruitingConversation`/`saveRecruitingChatMessage`/`saveRecruitingLead` signatures unchanged (Task 10) for the same reason; `HealthReport.checks` key renamed `supabase`→`neon` consistently across `check.ts`, `status/page.tsx`, `scripts/health.ts`, and the test file (Task 11) — no file was missed since a grep for `checks.supabase` was run during research and turned up exactly those 3 consumers.
- **Scope check:** this plan is one coherent project (swap the DB layer) — not decomposed further, since every task depends on the schema/client from Tasks 1-4 and the tasks are already ordered as a dependency chain, not independent sub-projects.
