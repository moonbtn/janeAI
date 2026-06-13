# Recruiting chat token optimization (Moderate)

Date: 2026-06-13
Branch: janeai-chatbot-iso

## Goal

Cut token cost per turn and make Jane's replies shorter and more readable, without thinning answer quality. "Moderate" intensity: meaningful savings with a safety margin so answers don't get curt or context-starved.

## Current state

- `src/lib/recruiting-rag/prompt.ts` — `CONVERSATION_MODES` (DISCOVER ≤80w, ADVISE ≤150w, DIRECT 1–3 sentences); `FEW_SHOT_EXAMPLES` has 11 pairs, including 5 decline/refuse examples.
- `src/app/api/recruiting-chat/route.ts` — `maxOutputTokens: 1200`; `retrieveRelevantChunks(query, chunks, 4)`; system prompt passed as a plain `system:` string.
- `src/lib/recruiting-rag/chat-messages.ts` — `addCacheBreakpointToLastAssistantMessage` puts the only ephemeral cache breakpoint on the last **assistant** message; `appendContextToLatestUserMessage` appends RAG fresh to the latest **user** message every turn (so RAG is never cached).
- `src/lib/recruiting-rag/retrieval.ts` — `DEFAULT_RETRIEVED_TEXT_MAX_CHARS = 1200`; `formatRetrievedContext` emits `[Source N]` / `Topic` / `Source` / `Score` / `Text` per chunk.

### Why this is the token picture

- A 150-word answer is only ~200 output tokens — output length is a minor cost.
- RAG dominates: up to 4 chunks × ~300 tokens = ~1200 tokens of **un-cacheable** input every turn (appended to the user message, after the breakpoint). Keyword retrieval (`matches / queryTokens`) means chunks #3–4 are usually low-relevance.
- The system prompt is cached only from turn 2 (breakpoint sits on the last assistant message). Turn 1 of every conversation pays full price and writes nothing — wasteful for short, multi-user conversations where the system prompt is identical across users.

## Changes

### 1. Output brevity — `prompt.ts`

- ADVISE: `under 150 words` → `under 90 words`. Add a hard rule: lead with the answer; no preamble, no restating the question, no filler sign-offs.
- DIRECT: `1–3 sentences` → `1–2 sentences`.
- Add one global brevity line to `CONVERSATION_MODES`: default to the shortest reply that fully answers; never pad.
- `FEW_SHOT_EXAMPLES`: shorten the long ADVISE example (current ~70 words) to ~40 so the model mirrors brevity. Leave the decline/refuse examples as-is — they sit in the cached prefix (negligible token gain) and are safety-relevant, and tests pin the bomb/cockroach/pasta cases.

### 2. Output cap — `route.ts`

- `maxOutputTokens: 1200` → `512`. Safety guard against runaway answers; no routine cost change.

### 3. RAG input — `route.ts` + `retrieval.ts`

- `retrieveRelevantChunks(..., 4)` → `3` (route.ts).
- `DEFAULT_RETRIEVED_TEXT_MAX_CHARS` `1200` → `900` (retrieval.ts). Combined ≈ −40% worst-case RAG tokens/turn.
- `formatRetrievedContext`: drop the `Score:` line — the model doesn't need it.

### 4. Cache the static system prompt — `route.ts` (+ helper if needed)

- Give the static system prompt its **own** ephemeral cache breakpoint so it is written on turn 1 and reused across turns **and** across conversations (identical prefix, 5-min TTL refreshed on each hit). Keep the existing rolling assistant-message breakpoint → 2 breakpoints total, within Anthropic's limit of 4.
- Implementation: pass the system prompt as an explicit system `ModelMessage` carrying `providerOptions.anthropic.cacheControl: { type: 'ephemeral' }` (the same shape already used in `addCacheBreakpointToLastAssistantMessage`), and drop the plain `system:` arg. Confirm the SDK emits two `cache_control` blocks.

## Trade-offs / risks

- Shorter output + fewer/smaller chunks both reduce richness. Moderate keeps headroom; if testing shows thin answers, bump ADVISE to 110 words or the RAG char cap back to 1000.
- The system-prompt caching change alters request shape — the one change that can regress silently. Verify via Anthropic usage fields (`cache_creation_input_tokens` on turn 1, `cache_read_input_tokens` on turn 2+).

## Testing / verification

- One existing-test edit required: `tests/recruiting-rag.test.ts` asserts `/under 150 words/` — update to `/under 90 words/`. All other suites stay green unchanged (57 tests baseline).
- Add a unit test for the new `buildCachedSystemMessage` helper in `tests/chat-messages.test.ts`.
- Manual (dev server): send a recruiting question and confirm (a) replies are visibly shorter, (b) decline/refusal paths still fire correctly (Jane-background, harmful, off-topic), (c) token usage shows a cache read on turn 2+.

## Out of scope (YAGNI)

- Conversation-history truncation/windowing.
- Switching retrieval from keyword overlap to embeddings.
- Changing model or provider.
