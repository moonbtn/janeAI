# Recruiting chat — restrict scope to recruiting only (decline questions about Jane)

- **Date:** 2026-06-13
- **Status:** Approved
- **Branch:** `janeai-chatbot-iso`

## Problem

JaneAI currently answers direct questions about Jane (personal and professional) from
approved profile facts — e.g. `"Jane học ở đâu?"` → answers from public profile context.
The product owner wants JaneAI to be a **recruiting-advice bot only**. Any question about
Jane herself should be declined.

## Decided behavior

- **In scope:** greetings/pleasantries, and recruiting topics (hiring need, role scope,
  candidate persona, sourcing, screening, interview, offer risk, follow-up, job-post quality).
- **Questions about Jane** — personal (age, family, hobbies, food, birthday) **and**
  professional background (education, work history, years of experience, employers) — are
  **out of scope**. Decline, do not answer, even if approved profile context is present.
- **Greetings** still get a brief friendly reply that opens toward recruiting (not declined).
- **Harmful / other out-of-scope** requests: unchanged — brief refusal and stop.
- **Decline wording:** `Câu này JaneAI không trả lời được, mình chỉ hỗ trợ các câu hỏi về tuyển dụng thôi nhé.`

## Approach (chosen: A — prompt-level)

Enforce the new scope in the system prompt (the LLM already refuses reliably — bomb / pest /
pasta few-shots work today), and stop actively surfacing Jane profile context.

Rejected alternatives:
- **B — code-level hard filter** detecting "Jane questions": brittle (the token `jane` also
  appears in legitimate recruiting messages, e.g. sample JDs) → over-engineered. YAGNI.
- **C — delete the `jane-profile-facts.jsonl` corpus**: removes approved data and widens the
  blast radius (breaks corpus-load tests). Deferred; not needed once the boost + prompt change land.

## Changes by file

- **`src/lib/recruiting-rag/prompt.ts`**
  - Scope line: drop *"direct questions about Jane/JaneAI using approved profile facts"* → keep greetings + recruiting only.
  - Add a decline rule: questions about Jane (personal **or** professional) are out of scope; do not answer even with approved context; reply with the decline wording, then stop.
  - `DIRECT` mode: remove *"personal questions about Jane/JaneAI"* (DIRECT = greetings + narrow recruiting facts).
  - `CONTEXT_HANDLING`: questions about Jane now take the decline path (not DIRECT) regardless of context.
  - Remove the two instructions about answering personal Jane questions from approved facts / "do not pivot".
  - Few-shot: convert the two `"Jane làm việc bao lâu rồi?"` / `"Jane học ở đâu?"` examples from answers to declines.
- **`src/lib/recruiting-rag/retrieval.ts`** — remove `profileBoost` so `jane_profile` chunks are not prioritized.
- **`src/lib/recruiting-rag/corpus/jane-profile-facts.jsonl`** — **kept** (data unchanged).

## Test plan (TDD — adjust tests first)

- Remove `recruiting-rag.test.ts` → *"prioritizes Jane profile context for direct Jane questions"* (tests the removed boost).
- Remove `recruiting-rag-eval.test.ts` → *"retrieves Jane profile facts for personal Jane questions"* (relies on the removed boost).
- Update `recruiting-rag.test.ts` → *"builds a static mindset-first system prompt…"*: replace the old scope/`personal questions about Jane`/`do not pivot` assertions with the new scope; **add** an assertion that the prompt contains the Jane decline rule + wording.
- Corpus-load and golden-retrieval tests stay green (golden cases contain no `jane_profile` case).
- Keep the byte-identical-prompt (cacheable prefix) test green.

## Out of scope

- Removing the `jane_profile` corpus file.
- Any code-level question classifier / hard filter.

## Rollout

Implement on `janeai-chatbot-iso` → `npm run test:unit` green → merge to `main` → deploy to prod
via the `deploy-jane-ai` skill. (Direct push to `main` is blocked by the harness; use the
documented push-as-`moonbtn` flow / deploy skill.)
