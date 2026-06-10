alter table public.recruiting_chat_conversations
  add column if not exists user_email text;

create index if not exists idx_recruiting_chat_conversations_user_email
  on public.recruiting_chat_conversations(user_email)
  where user_email is not null;
