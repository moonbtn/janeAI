-- Recruiting chat persistence for the Jane AI dashboard.
-- The app writes these tables from Next.js server routes with SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.recruiting_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiting_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.recruiting_chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  used_chunk_ids text[] not null default '{}',
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.recruiting_leads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid references public.recruiting_chat_conversations(id) on delete set null,
  email text not null,
  name text,
  company text,
  hiring_need text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.recruiting_chat_conversations enable row level security;
alter table public.recruiting_chat_messages enable row level security;
alter table public.recruiting_leads enable row level security;

revoke all on table public.recruiting_chat_conversations from anon, authenticated;
revoke all on table public.recruiting_chat_messages from anon, authenticated;
revoke all on table public.recruiting_leads from anon, authenticated;

grant select, insert, update, delete on table public.recruiting_chat_conversations to service_role;
grant select, insert, update, delete on table public.recruiting_chat_messages to service_role;
grant select, insert, update, delete on table public.recruiting_leads to service_role;

create index if not exists idx_recruiting_chat_conversations_user_updated
  on public.recruiting_chat_conversations(user_id, updated_at desc);

create index if not exists idx_recruiting_chat_messages_conversation_created
  on public.recruiting_chat_messages(conversation_id, created_at);

create index if not exists idx_recruiting_leads_user_created
  on public.recruiting_leads(user_id, created_at desc);

create index if not exists idx_recruiting_leads_conversation_id
  on public.recruiting_leads(conversation_id);
