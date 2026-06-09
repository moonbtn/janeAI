-- NOTE: The jd_history table already exists in the database.
-- Run this script only to add the questionnaire tables.

create table questionnaires (
  id uuid primary key default gen_random_uuid(),
  jd_history_id uuid references jd_history(id) on delete cascade,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  questions jsonb not null default '[]',
  prefilled_answers jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'answered')),
  expires_at timestamptz default now() + interval '30 days',
  created_at timestamptz default now()
);

create table questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid unique references questionnaires(id) on delete cascade,
  answers jsonb not null default '{}',
  submitted_at timestamptz default now()
);

create index idx_qa_questionnaire_id on questionnaire_answers(questionnaire_id);

-- Recruiting chatbot thin vertical slice.
-- Run this after the existing Jane AI tables are present.

create table if not exists recruiting_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruiting_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references recruiting_chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  used_chunk_ids text[] not null default '{}',
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists recruiting_leads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  conversation_id uuid references recruiting_chat_conversations(id) on delete set null,
  email text not null,
  name text,
  company text,
  hiring_need text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table recruiting_chat_conversations enable row level security;
alter table recruiting_chat_messages enable row level security;
alter table recruiting_leads enable row level security;

revoke all on table recruiting_chat_conversations from anon, authenticated;
revoke all on table recruiting_chat_messages from anon, authenticated;
revoke all on table recruiting_leads from anon, authenticated;

grant select, insert, update, delete on table recruiting_chat_conversations to service_role;
grant select, insert, update, delete on table recruiting_chat_messages to service_role;
grant select, insert, update, delete on table recruiting_leads to service_role;

create index if not exists idx_recruiting_chat_conversations_user_updated
  on recruiting_chat_conversations(user_id, updated_at desc);
create index if not exists idx_recruiting_chat_conversations_user_email
  on recruiting_chat_conversations(user_email)
  where user_email is not null;
create index if not exists idx_recruiting_chat_messages_conversation_created
  on recruiting_chat_messages(conversation_id, created_at);
create index if not exists idx_recruiting_leads_user_created
  on recruiting_leads(user_id, created_at desc);
create index if not exists idx_recruiting_leads_conversation_id
  on recruiting_leads(conversation_id);
