# Jane AI

AI-powered recruitment assistant for creating job descriptions, sending candidate questionnaires, and publishing job postings across multiple platforms.

## Features

- **AI Job Description Generator** — Generate polished JDs from a URL or manual input using Claude
- **Candidate Questionnaires** — Send tokenized questionnaire links to candidates; collect and summarize answers with AI
- **Multi-platform Job Posting** — Publish job posts to LinkedIn, Facebook, and other channels
- **Recruiter Dashboard** — Track questionnaire history, candidate status (hired/rejected), and send reminders
- **Auth** — Sign in with Clerk; OAuth integrations per posting platform

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **AI:** Anthropic Claude (`@anthropic-ai/sdk`)
- **Auth:** Clerk
- **Database:** Supabase
- **Styling:** Tailwind CSS v4

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ENCRYPTION_KEY=
```

Recruiting chat provider selection:

```env
# Optional. Defaults to anthropic. In local development, Jane auto-selects
# openai when OPENAI_API_KEY is set and ANTHROPIC_API_KEY is not set.
RECRUITING_CHAT_PROVIDER=anthropic # or openai
RECRUITING_CHAT_ANTHROPIC_MODEL=claude-opus-4-7
RECRUITING_CHAT_OPENAI_MODEL=gpt-5.4-mini
```

## Supabase Setup

Apply the recruiting chat persistence migration before testing chat storage:

```bash
set -a
source .env
set +a
psql "$DATABASE_URL" -f supabase/migrations/20260609143000_recruiting_chat_persistence.sql
```

The chat API stores conversations, messages, retrieved chunk IDs, and lead captures through the server-side Supabase service-role client. The migration enables RLS on those tables and grants access only to `service_role`.

If `DATABASE_URL` points at `db.<project-ref>.supabase.co` and `psql` fails with `No route to host`, copy the IPv4-compatible pooler connection string from Supabase Dashboard → Project Settings → Database → Connection string and use that as `DATABASE_URL`.

## Recruiting RAG Corpus

The recruiting chat loads its approved-public knowledge corpus from:

```txt
src/lib/recruiting-rag/corpus/approved-kb-chunks-with-cards.jsonl
```

This committed artifact contains 510 approved chunks with `embedding_text` retrieval cards. It was copied from the source-material pipeline export `approved_kb_chunks_with_cards.jsonl`.

## Project Structure

```
src/
├── app/
│   ├── app/          # Recruiter dashboard
│   ├── admin/        # Admin panel
│   ├── q/[token]/    # Candidate questionnaire flow
│   ├── sign-in/
│   ├── sign-up/
│   └── api/
│       ├── generate/           # AI JD generation
│       ├── questionnaire/      # Questionnaire CRUD & resend
│       ├── history/            # JD history
│       ├── post-job/           # Job posting & publishing
│       ├── feedback/           # Feedback widget
│       ├── reminders/          # Reminder banners
│       └── auth/[platform]/    # OAuth per platform
├── components/
└── lib/              # Supabase client, encryption, rate limiting
```

## Deploy

Deployed on Vercel at [ai.bebetterwithjane.com](https://ai.bebetterwithjane.com).
