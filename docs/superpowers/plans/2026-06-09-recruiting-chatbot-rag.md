# Recruiting Chatbot RAG First PR Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin recruiting advisor chatbot/RAG pathway to the existing Jane AI production interface.

**Architecture:** Keep the current `/app` dashboard as the interface, add a focused chat panel, stream responses with the Vercel AI SDK and direct Anthropic, retrieve from an approved-public fixture sampled from the cards export, persist conversations/messages/used chunks/leads in Supabase, and add offline RAG evaluation.

**Tech Stack:** Next.js 16 App Router, React 19, Clerk, Supabase, Tailwind CSS v4, Vercel AI SDK v6, Anthropic.

---

## Implementation Checklist

- [x] Update `docs/moonbtn-janeai-handoff.md` with current corpus guidance:
  - Best ingestion input: `approved_kb_chunks_with_cards.jsonl`.
  - Plain export: `approved_kb_chunks.jsonl`.
  - Qwen/Ollama review files under `recruiting-doc-bot/data/processed/`.
  - Note that `transcript_useful_rag_chunks.jsonl` is unreviewed and not deploy-safe.
- [x] Add AI SDK and test runner dependencies.
- [x] Add parser/retrieval/prompt/persistence helpers under `src/lib/recruiting-rag/`.
- [x] Add a deploy-safe approved fixture sampled from `approved_kb_chunks_with_cards.jsonl`.
- [x] Add offline retrieval evaluation through `npm run rag:evaluate`.
- [x] Add Supabase schema entries for recruiting conversations, messages, and leads.
- [x] Add `POST /api/recruiting-chat` with Clerk auth, rate limiting, fixture retrieval, streamed Anthropic response, metadata, and persistence.
- [x] Add `POST /api/recruiting-leads` with optional lead capture.
- [x] Add an `Ask Jane` advisor panel inside `/app`.
- [ ] Verify with unit tests, RAG evaluation, lint, build, and browser check.

## Acceptance Criteria

- Chat entry stays inside the existing production interface and does not copy the old reference UI.
- Retrieval uses only committed `approved_public` fixture rows and prefers `embedding_text` for scoring.
- Assistant stream metadata carries `conversationId`, `usedChunkIds`, and source summaries.
- Supabase schema supports durable conversation/message/lead storage.
- Offline retrieval evaluation can run without calling the LLM and fails on golden-case regressions.

## Verification Commands

```bash
npm run test:unit
npm run rag:evaluate
npm run lint
npm run build
```
