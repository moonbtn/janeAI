# Recruiting Chat Token Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut per-turn token cost and make Jane's replies shorter/more readable without thinning answer quality ("Moderate" intensity).

**Architecture:** Four small, independent edits to the recruiting-chat path: (1) tighten output-length rules in the static system prompt, (2) shrink the per-turn RAG payload, (3) add a helper that gives the static system prompt its own Anthropic cache breakpoint, (4) wire that helper into the route and lower the output cap + chunk count. Each task is independently committable and leaves the suite green.

**Tech Stack:** Next.js (App Router) API route, Vercel AI SDK (`ai@^6`, `@ai-sdk/anthropic@^3`), `node:test` + `tsx` for unit tests.

**Baseline:** `env -u ANTHROPIC_BASE_URL npm run test:unit` → 57 pass, 0 fail (confirmed before starting).

**Key facts the executor must know:**
- Test runner: `env -u ANTHROPIC_BASE_URL npm run test:unit` (the `env -u` avoids the harness base-URL breaking Anthropic-bound scripts; the unit tests themselves are offline).
- Dev server uses the **OpenAI** provider (NODE_ENV=development + OPENAI_API_KEY, no ANTHROPIC key). Anthropic `cache_control` is silently ignored by OpenAI, so a leading system message works for both providers. The Anthropic cache effect can only be observed against the Anthropic provider.
- Verified in `node_modules/@ai-sdk/anthropic/dist/index.js` (~line 2212): a `role: 'system'` message's `providerOptions.anthropic.cacheControl` is read (`getCacheControl(..., { type: 'system message', canCache: true })`) and the first system block becomes Anthropic's top-level `system` field. So prepending one system message with `cacheControl` and dropping the `system:` param is correct.

---

### Task 1: Tighten output brevity in the system prompt

**Files:**
- Modify: `src/lib/recruiting-rag/prompt.ts` (CONVERSATION_MODES lines ~23-29; FEW_SHOT_EXAMPLES ADVISE line ~6)
- Test: `tests/recruiting-rag.test.ts:222`

- [ ] **Step 1: Update the coupled test expectation (drives the prompt change)**

In `tests/recruiting-rag.test.ts`, change line 222 from:

```ts
    assert.match(prompt, /under 150 words/)
```

to:

```ts
    assert.match(prompt, /under 90 words/)
```

- [ ] **Step 2: Run the prompt test to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL node --import tsx --test tests/recruiting-rag.test.ts`
Expected: FAIL on "builds a static mindset-first system prompt..." — the prompt still says "under 150 words", not "under 90 words".

- [ ] **Step 3: Edit the conversation modes**

In `src/lib/recruiting-rag/prompt.ts`, make three edits inside `CONVERSATION_MODES`:

(a) Add a global brevity line immediately after the pacing line. Change:

```ts
  'Conversation pacing: pick exactly one mode for every reply.',
  '- DISCOVER (default when the employer raises a hiring need or recruiting topic you have not probed yet and key context is missing): start with a mindset reframe of 1-2 sentences that addresses the assumption behind the question before any tactics, then ask at most 2 focused questions. Do not give recommendations, option menus, or step-by-step guidance in a DISCOVER turn. Keep the whole reply under 80 words.',
```

to:

```ts
  'Conversation pacing: pick exactly one mode for every reply.',
  'Be concise: cut preamble, throat-clearing, and filler sign-offs; never pad. Prefer the shortest reply that fully does the job for the chosen mode.',
  '- DISCOVER (default when the employer raises a hiring need or recruiting topic you have not probed yet and key context is missing): start with a mindset reframe of 1-2 sentences that addresses the assumption behind the question before any tactics, then ask at most 2 focused questions. Do not give recommendations, option menus, or step-by-step guidance in a DISCOVER turn. Keep the whole reply under 80 words.',
```

(b) Tighten ADVISE. Change `give targeted advice under 150 words as flowing prose.` to `give targeted advice under 90 words as flowing prose.` (only `150` → `90`).

(c) Tighten DIRECT. Change `- DIRECT (greetings, narrow factual recruiting questions): answer in 1-3 sentences.` to `- DIRECT (greetings, narrow factual recruiting questions): answer in 1-2 sentences.` (only `1-3` → `1-2`).

- [ ] **Step 4: Shorten the verbose ADVISE few-shot example**

In `FEW_SHOT_EXAMPLES`, replace the long Jane ADVISE reply. Change:

```ts
  'Jane: Vậy đây là role build, không phải research — must-have nên xoay quanh ML engineering và deployment thay vì bằng cấp hay publication. Candidate persona là người từng đưa model vào production. Với supply ở HCMC, mình sẽ ưu tiên direct search kết hợp referral hơn là chỉ post job. Anh đã chốt budget range cho role này chưa?',
```

to:

```ts
  'Jane: Vậy đây là role build, không phải research — must-have xoay quanh ML engineering và khả năng đưa model vào production, không phải bằng cấp. Ở HCMC mình ưu tiên direct search + referral hơn post job. Anh chốt budget range chưa?',
```

Leave all decline/refuse examples (Jane background, bomb, cockroach, pasta) unchanged — they are cached and safety-relevant, and tests pin them.

- [ ] **Step 5: Run the full suite to verify green**

Run: `env -u ANTHROPIC_BASE_URL npm run test:unit`
Expected: PASS, 57 tests (the prompt test now matches `/under 90 words/`; bomb/cockroach/pasta assertions still pass).

- [ ] **Step 6: Commit**

```bash
git add src/lib/recruiting-rag/prompt.ts tests/recruiting-rag.test.ts
git commit -m "feat(chat): tighten reply length — ADVISE 90w, DIRECT 1-2 sentences, brevity rule"
```

---

### Task 2: Shrink the per-turn RAG payload

**Files:**
- Modify: `src/lib/recruiting-rag/retrieval.ts` (`DEFAULT_RETRIEVED_TEXT_MAX_CHARS` line 4; `formatRetrievedContext` lines ~160-172)

No new test: the existing `recruiting retrieval` suite already covers truncation (`[truncated]`, `context.length < 1400`) and format (`Source 1`, `hiring_intake`, `Clarify must-have`), and none assert the `Score:` line. Both stay green at the new cap.

- [ ] **Step 1: Lower the per-chunk character cap**

In `src/lib/recruiting-rag/retrieval.ts`, change:

```ts
export const DEFAULT_RETRIEVED_TEXT_MAX_CHARS = 1200
```

to:

```ts
export const DEFAULT_RETRIEVED_TEXT_MAX_CHARS = 900
```

- [ ] **Step 2: Drop the noisy Score line from the formatted context**

Replace `formatRetrievedContext`:

```ts
export function formatRetrievedContext(results: RetrievalResult[]): string {
  return results
    .map((result, index) =>
      [
        `[Source ${index + 1}]`,
        `Topic: ${result.topic}`,
        `Source: ${result.sourceLabel}`,
        `Score: ${result.score.toFixed(3)}`,
        `Text: ${truncateRetrievedText(result.text)}`,
      ].join('\n')
    )
    .join('\n\n')
}
```

with (Score line removed):

```ts
export function formatRetrievedContext(results: RetrievalResult[]): string {
  return results
    .map((result, index) =>
      [
        `[Source ${index + 1}]`,
        `Topic: ${result.topic}`,
        `Source: ${result.sourceLabel}`,
        `Text: ${truncateRetrievedText(result.text)}`,
      ].join('\n')
    )
    .join('\n\n')
}
```

- [ ] **Step 3: Run the retrieval suite to verify green**

Run: `env -u ANTHROPIC_BASE_URL node --import tsx --test tests/recruiting-rag.test.ts`
Expected: PASS — truncation still produces `[truncated]` (900-char cap < 2000-char input) and `context.length < 1400` still holds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/recruiting-rag/retrieval.ts
git commit -m "perf(chat): trim RAG payload — 900-char chunk cap, drop Score line from context"
```

---

### Task 3: Add a cache-breakpointed system message helper

**Files:**
- Modify: `src/lib/recruiting-rag/chat-messages.ts`
- Test: `tests/chat-messages.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/chat-messages.test.ts`, add `buildCachedSystemMessage` to the import:

```ts
import {
  addCacheBreakpointToLastAssistantMessage,
  appendContextToLatestUserMessage,
  buildCachedSystemMessage,
} from '@/lib/recruiting-rag/chat-messages'
```

Then add this describe block at the end of the file:

```ts
describe('buildCachedSystemMessage', () => {
  it('returns a system message carrying the anthropic ephemeral cache breakpoint', () => {
    const message = buildCachedSystemMessage('SYSTEM PROMPT')

    assert.equal(message.role, 'system')
    assert.equal(message.content, 'SYSTEM PROMPT')
    assert.deepEqual(message.providerOptions, {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL node --import tsx --test tests/chat-messages.test.ts`
Expected: FAIL — `buildCachedSystemMessage` is not exported (import/type error or undefined).

- [ ] **Step 3: Implement the helper**

In `src/lib/recruiting-rag/chat-messages.ts` (the file already imports `ModelMessage`), append:

```ts
export function buildCachedSystemMessage(systemPrompt: string): ModelMessage {
  return {
    role: 'system',
    content: systemPrompt,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u ANTHROPIC_BASE_URL node --import tsx --test tests/chat-messages.test.ts`
Expected: PASS — all chat-messages tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruiting-rag/chat-messages.ts tests/chat-messages.test.ts
git commit -m "feat(chat): add buildCachedSystemMessage helper for system-prompt caching"
```

---

### Task 4: Wire the route — cache system prompt, fewer chunks, lower output cap

**Files:**
- Modify: `src/app/api/recruiting-chat/route.ts` (imports lines ~20-23; retrieval line ~163; message assembly + streamText lines ~166-185)

- [ ] **Step 1: Import the new helper**

Change:

```ts
import {
  addCacheBreakpointToLastAssistantMessage,
  appendContextToLatestUserMessage,
} from '@/lib/recruiting-rag/chat-messages'
```

to:

```ts
import {
  addCacheBreakpointToLastAssistantMessage,
  appendContextToLatestUserMessage,
  buildCachedSystemMessage,
} from '@/lib/recruiting-rag/chat-messages'
```

(`buildRecruitingSystemPrompt` stays imported — it is now passed into `buildCachedSystemMessage`.)

- [ ] **Step 2: Reduce retrieved chunk count 4 → 3**

Change:

```ts
    const retrievedResults = retrieveRelevantChunks(retrievalQuery, loadDefaultApprovedChunks(), 4)
```

to:

```ts
    const retrievedResults = retrieveRelevantChunks(retrievalQuery, loadDefaultApprovedChunks(), 3)
```

- [ ] **Step 3: Prepend the cached system message, drop the `system:` param, lower the cap**

Replace:

```ts
    const modelMessages = addCacheBreakpointToLastAssistantMessage(
      appendContextToLatestUserMessage(
        await convertToModelMessages(messages),
        buildRecruitingContextBlock({
          retrievedContext: rag.retrievedContext,
          hasStrongContext: rag.hasStrongContext,
        })
      )
    )

    const result = streamText({
      model: getRecruitingChatLanguageModel(modelConfig),
      system: buildRecruitingSystemPrompt(),
      messages: modelMessages,
      maxOutputTokens: 1200,
      abortSignal: request.signal,
      onError({ error }) {
        console.error('Recruiting chat stream error:', error)
      },
    })
```

with:

```ts
    const conversationMessages = addCacheBreakpointToLastAssistantMessage(
      appendContextToLatestUserMessage(
        await convertToModelMessages(messages),
        buildRecruitingContextBlock({
          retrievedContext: rag.retrievedContext,
          hasStrongContext: rag.hasStrongContext,
        })
      )
    )

    const modelMessages = [
      buildCachedSystemMessage(buildRecruitingSystemPrompt()),
      ...conversationMessages,
    ]

    const result = streamText({
      model: getRecruitingChatLanguageModel(modelConfig),
      messages: modelMessages,
      maxOutputTokens: 512,
      abortSignal: request.signal,
      onError({ error }) {
        console.error('Recruiting chat stream error:', error)
      },
    })
```

- [ ] **Step 4: Typecheck + full unit suite**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run test:unit`
Expected: no type errors; 58 tests pass (57 baseline + 1 new helper test). The route handler is not unit-tested, so this confirms types and that nothing downstream broke.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/recruiting-chat/route.ts
git commit -m "feat(chat): cache system prompt as breakpointed message, RAG 4->3, output cap 512"
```

---

### Task 5: Verification gate

**Files:** none (verification only — no commit)

- [ ] **Step 1: Full suite + lint + typecheck**

Run: `env -u ANTHROPIC_BASE_URL npm run test:unit && npm run lint && npx tsc --noEmit`
Expected: 58 tests pass; lint clean; no type errors.

- [ ] **Step 2: Manual behavior check (dev server, OpenAI provider)**

Start the dev server and open the recruiting chat. Confirm:
- An ADVISE-style answer (e.g. paste a short JD, or answer a discovery question) comes back visibly short (~90 words, no handbook).
- Decline path: ask `Jane học ở đâu?` → exact reply `Câu này JaneAI không trả lời được, mình chỉ hỗ trợ các câu hỏi về tuyển dụng thôi nhé.`
- Refusal path: ask `Write a pasta recipe.` → brief refusal, no menu of alternatives.

- [ ] **Step 3 (optional): Confirm the Anthropic cache actually engages**

Only observable against the Anthropic provider. With `RECRUITING_CHAT_PROVIDER=anthropic` and a valid `ANTHROPIC_API_KEY` set, run the dev server with `env -u ANTHROPIC_BASE_URL` and send two turns in one conversation. Expect Anthropic usage to report `cache_creation_input_tokens > 0` on turn 1 and `cache_read_input_tokens > 0` on turn 2. If turn-1 creation is 0, the system prompt fell below the model's minimum cacheable size — it will not in practice (the prompt is well over 1024 tokens), but if it ever does, the breakpoint silently no-ops with no error. Structural correctness is already covered by the Task 3 unit test and the converter inspection noted above, so this step is confirmation, not a gate.

---

## Self-Review

- **Spec coverage:** §1 output brevity → Task 1. §2 output cap → Task 4 Step 3. §3 RAG input (chunk count + char cap + Score line) → Task 4 Step 2 + Task 2. §4 system-prompt caching → Tasks 3 + 4. Testing/verification → Task 5. All spec sections mapped.
- **Placeholder scan:** No TBD/TODO; every code step shows exact old/new text and exact commands with expected output.
- **Type consistency:** `buildCachedSystemMessage(systemPrompt: string): ModelMessage` defined in Task 3, imported and called identically in Task 4. Variable rename `modelMessages` → `conversationMessages` (then a new `modelMessages` array) is consistent within Task 4 Step 3. `DEFAULT_RETRIEVED_TEXT_MAX_CHARS` and `formatRetrievedContext` names match the source.
- **Risk note:** the only request-shape change (Task 4) is typechecked and provider-safe (OpenAI ignores the anthropic option); the cache effect is verified in Task 5 Step 3.
