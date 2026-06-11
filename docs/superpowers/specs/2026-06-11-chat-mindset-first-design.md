# Design: Chat Mindset-First Behavior + Token Optimization

**Date:** 2026-06-11
**Scope:** JaneAI recruiting chat (`src/lib/recruiting-rag/prompt.ts`, `src/app/api/recruiting-chat/route.ts`)

## Problem

1. **Behavior:** Jane answers too long and in guide/handbook style. Desired: address the employer's *mindset* first, ask questions back, and only give suggestions after the employer has answered.
2. **Token cost:** This is a chat — the system prompt and full history are re-sent every turn. The current prompt already asks for short answers ("Match answer length…", "Ask max one focused follow-up") but is too weak; and the RAG context block sits at the end of the **system prompt**, which changes every turn and therefore invalidates the prompt cache for the entire conversation history on every request.

Model: `claude-opus-4-7` (prod). Pricing: input $5/M, output $25/M, cache read ~0.1× input, cache write 1.25×. Output is 5× more expensive than input → shortening replies is the single biggest cost lever, and it is the same change the behavior redesign requires.

## Decisions (validated with user)

- **First turn on a topic always asks first** — no suggestions until the user answers (exceptions below).
- **Max 2 questions per ask-back turn.**
- **Length controlled by explicit per-mode word targets** in the prompt; `maxOutputTokens: 1200` stays as a safety net only.
- **Approach:** prompt rewrite + multi-turn few-shots (no code-side turn-state detection, no post-generation compression) **plus** the token-optimization layer (RAG context out of system prompt + cache breakpoint).

## 1. Behavior: three turn modes

The system prompt defines three modes; Jane picks one per turn.

### DISCOVER — default when the user raises a hiring need/topic Jane has not yet probed
- Open with a **mindset reframe** (1–2 sentences): address the assumption behind the question before tactics. Example: asked "post job ở đâu?" → reframe that the channel is not the root issue, the unclear candidate persona is.
- Then ask **at most 2** focused questions.
- **No suggestions/solutions in this turn.** ≤ ~80 words.
- **Anti-interrogation guard:** at most 2 DISCOVER turns per topic. After that Jane must switch to ADVISE, stating her assumptions where information is missing.

### ADVISE — when the user has answered Jane's questions, supplied enough context up front (e.g. pasted a JD for review), or explicitly says "cứ trả lời đi"
- Short targeted advice, ≤ ~150 words, **prose-first** — bullets only for genuine comparisons/trade-offs.
- Never multi-section handbooks unless the user explicitly asks for a plan/checklist.
- May end with at most 1 optional follow-up question.

### DIRECT — greetings, narrow factual questions, Jane profile questions
- Answer directly in 1–3 sentences, no pivot into hiring-need consulting (keeps existing rule).

All existing safety, scope, confidentiality, anti-injection, and Jane-profile rules are kept unchanged.

### Few-shot replacement
Replace the current single-turn examples with:
- One **multi-turn** example: broad question → DISCOVER (reframe + 2 questions) → user answers → ADVISE (short, prose).
- One narrow factual question → DIRECT.
- One "cứ tư vấn luôn đi" → immediate short ADVISE with stated assumptions.
- **Keep verbatim:** Jane profile examples and the refusal examples (bomb / cockroach / pasta) — tests assert on them and they anchor refusal behavior.

## 2. Token optimization

### 2a. Output (biggest lever)
The mode system above cuts typical replies from ~700-token guides to ~120–400-token turns. No code change; `maxOutputTokens: 1200` unchanged (a lower cap doesn't change style, only truncates mid-sentence).

### 2b. Prompt caching restructure
Anthropic caching is a **prefix match**; render order is tools → system → messages. Today `buildRecruitingSystemPrompt()` embeds the per-turn RAG context (or per-turn fallback branch) in the system prompt, so the prefix changes every turn and the conversation history can never be cached.

New structure:
- **Static system prompt** — `RECRUITING_SYSTEM_PROMPT` becomes a parameter-less constant: behavior modes, safety/scope rules, few-shots, plus instructions for *both* context cases ("an `<approved_retrieved_context>` block may appear in the latest user message; if absent or marked weak, say what's missing and help frame the hiring need" — current fallback text folded in as a static rule).
- **Per-turn context block** — new `buildRecruitingContextBlock({ retrievedContext, hasStrongContext })` returns either the `<approved_retrieved_context>…</approved_retrieved_context>` block or a weak-context marker. The route appends it as an extra text part on the **latest user message only** (after `convertToModelMessages`). History messages never carry injected context, so they stay byte-stable across requests.
- **Cache breakpoint** — set Anthropic `cacheControl: { type: 'ephemeral' }` via AI SDK `providerOptions` on the **last assistant message** (the end of the stable history). First turn has no assistant message yet → nothing to cache, which is fine. Exact `providerOptions` placement syntax must be verified against the installed `@ai-sdk/anthropic` version during implementation.
- Per-request economics after the change: cache read (0.1×) on system + all history up to the previous assistant turn; full price only on the ~2 newest messages + the new context block. Minimum cacheable prefix on Opus 4.7 is 4096 tokens — typically crossed by turn 2–3; below that the marker is silently ignored (harmless).
- OpenAI dev provider ignores `anthropic` providerOptions — no branching needed.

### Non-impacts
- Retrieval (`buildRetrievalQuery`, `retrieveRelevantChunks`, 4 chunks), persistence, metadata/sources streaming, rate limiting: unchanged.
- Few-shot size: after caching, marginal prompt length costs ~0.1× — keep few-shots compact for quality reasons, not cost.

## Implementation surface

| File | Change |
|---|---|
| `src/lib/recruiting-rag/prompt.ts` | Rewrite: `buildRecruitingSystemPrompt()` becomes parameter-less and returns the static prompt (modes + rules + new few-shots); new `buildRecruitingContextBlock({ retrievedContext, hasStrongContext })` for the per-turn block |
| `src/app/api/recruiting-chat/route.ts` | Use static system prompt; append context block to latest user model message; add `providerOptions` cache breakpoint on last assistant message |
| `tests/recruiting-rag.test.ts` | Update prompt assertions: mode rules (ask-first, max-2-questions, word targets), static-prompt invariance, context-block content/fallback; keep safety/refusal assertions |

## Testing

- Unit: system prompt contains mode rules + retains safety examples; system prompt is byte-identical across calls; context block renders strong/weak variants; route injects context into the right message (extract message-building into a testable helper if needed).
- Manual eval in dev chat: (1) broad question → expect reframe + ≤2 questions, no advice; (2) answer the questions → expect ≤150-word prose advice; (3) "cứ trả lời đi" → immediate advice; (4) greeting/profile → 1–3 sentences; (5) refusal cases still refuse.

## Non-goals

- No model switch (stays `claude-opus-4-7`; provider config untouched).
- No code-side conversation-state machine, no second-pass length enforcement.
- No history trimming/windowing (conflicts with prefix caching; revisit only if conversations get very long).
- No UI changes.
