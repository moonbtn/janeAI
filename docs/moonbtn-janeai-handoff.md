# moonbtn/janeAI Chatbot Handoff

Use this document when opening a new Codex session in a fork or clone of `https://github.com/moonbtn/janeAI`.

## Direction

The `moonbtn/janeAI` repo is the production app and target interface. This repo is a reference implementation and source-material pipeline only.

Do not copy or preserve the old interface from this repo. Port the recruiting chatbot pathway into the existing `moonbtn/janeAI` interface.

## Local Workspace

Recommended sibling layout:

```txt
~/Documents/technical_project_personal/
  janeAI/              # reference implementation and approved source materials
  moonbtn-janeAI/      # target production app
```

Open Codex in `moonbtn-janeAI`, not inside this repo.

## Development Workflow

Use a fork or local branch so collaborator access is not a blocker:

```bash
cd ~/Documents/technical_project_personal
git clone https://github.com/YOUR_USERNAME/janeAI.git moonbtn-janeAI
cd moonbtn-janeAI
git remote add upstream https://github.com/moonbtn/janeAI.git
git checkout -b feature/recruiting-chatbot-rag
codex
```

Keep the branch updated with:

```bash
git fetch upstream
git rebase upstream/main
```

## New Codex Prompt

Paste this into the new Codex session:

```txt
We are porting the recruiting chatbot/RAG pathway from ../janeAI into this interface repo.

Treat ../janeAI as a reference implementation and source-material pipeline only.
Do not copy the old UI from ../janeAI.

Target outcome:
- Keep this repo's existing interface as the production app.
- Add a recruiting chatbot pathway for employers.
- Reuse approved source materials and RAG logic from ../janeAI where relevant.
- Use only approved public-safe chunks.
- Store customer conversations and used chunk IDs.
- Add lead capture.
- Keep the first PR small: a thin vertical slice in this interface, with fixture-backed or mocked retrieval if needed before real Neon/pgvector ingestion.

First inspect this repo's stack and structure. Then compare against ../janeAI for reusable RAG, prompt, ingestion, and persistence pieces. Propose a narrow first PR plan before editing.
```

## Source Materials To Reuse

Most relevant data is in:

```txt
../janeAI/recruiting-doc-bot/data/export/
../janeAI/recruiting-doc-bot/data/processed/
```

### Current Best Corpus

Use this artifact for retrieval-quality ingestion:

```txt
../janeAI/recruiting-doc-bot/data/export/approved_kb_chunks_with_cards.jsonl
```

It has 510 approved chunks and includes `embedding_text`. The reference app already parses and embeds `embedding_text` instead of raw `text` when present:

```txt
../janeAI/apps/web/lib/rag/approved-chunks.ts:49
../janeAI/apps/web/lib/rag/ingest.ts:54
```

The plain canonical export is:

```txt
../janeAI/recruiting-doc-bot/data/export/approved_kb_chunks.jsonl
```

It has 512 approved chunks, but lacks retrieval cards. The default reference ingest script still points there:

```txt
../janeAI/apps/web/scripts/ingest-approved-kb.ts:17
```

Only ingest chunks where:

```txt
risk_level = "approved_public"
```

### Local Model Classification Trail

The local model pass was Qwen via Ollama. Important processed files:

```txt
../janeAI/recruiting-doc-bot/data/processed/source_chunk_quality_review.jsonl
```

Latest production quality pass over source chunks. It has 645 rows: 471 gold, 56 silver, 6 bronze, 112 exclude.

```txt
../janeAI/recruiting-doc-bot/data/processed/source_chunk_retrieval_cards.jsonl
```

Retrieval cards for 511 approved-ish chunks.

```txt
../janeAI/recruiting-doc-bot/data/processed/transcript_topic_map_qwen3_14b.jsonl
```

Earlier transcript-only Qwen useful/topic map. It has 235 rows: 220 useful, 11 not useful, 4 error/blank.

```txt
../janeAI/recruiting-doc-bot/data/processed/transcript_useful_rag_chunks.jsonl
```

220 transcript chunks filtered from that topic map, but marked `risk_level: unreviewed`, so not deploy-safe by itself.

### Pipeline Read

The current production path is documented in:

```txt
../janeAI/recruiting-doc-bot/README.md:215
```

Pipeline:

```txt
recovered corpus -> source chunks -> Qwen quality review -> approved export -> optional retrieval cards
```

The Qwen quality-review script says `source_corpus_chunks.jsonl` is the source of truth and gold/silver rows are exported for `apps/web`:

```txt
../janeAI/recruiting-doc-bot/scripts/quality_review_source_chunks.py:1
```

Recommendation: treat `approved_kb_chunks_with_cards.jsonl` as the best ingestion input after reconciling/regenerating the two missing card rows, then update the default ingest path or package script so the app does not accidentally ingest the lower-quality plain text export.

Relevant reference areas:

```txt
../janeAI/apps/web/lib/ai/
../janeAI/apps/web/lib/rag/
../janeAI/apps/web/lib/db/
../janeAI/apps/web/app/(chat)/api/chat/route.ts
../janeAI/apps/web/app/api/leads/route.ts
../janeAI/apps/web/scripts/ingest-approved-kb.ts
```

## Product Boundaries

The production app should not crawl Google Drive, extract raw files, transcribe media, clean private data, or ingest messy internal corpora.

That work remains in `../janeAI/recruiting-doc-bot`.

The production app should only ingest approved handoff artifacts.

## Recommended First PR

Build a thin vertical slice:

- Chatbot entry point inside the existing `moonbtn/janeAI` interface
- Chat API route
- Recruiting advisor prompt
- Fixture-backed retrieval from a small approved sample copied from `approved_kb_chunks_with_cards.jsonl`
- Source/chunk IDs carried through the response
- Lead capture UI or route if easy
- Offline RAG evaluation for retrieval quality before testing in the app UI
- Clear placeholder for real Neon/pgvector ingestion

Avoid doing the full database, ingestion, retrieval, and deployment migration in the first PR unless the repo is already set up for it.

## Canonical Terms

- **Target Interface**: the customer-facing application owned by the friend's `moonbtn/janeAI` repo.
- **Production App**: the deployable app in `moonbtn/janeAI`.
- **Source Materials**: approved recruiting documents and derived knowledge artifacts reused for answers.
- **Reference Implementation**: this repo's existing chatbot/RAG implementation, excluding the old interface.
- **Migration Branch**: a fork or branch used to port behavior without waiting on collaborator access.
