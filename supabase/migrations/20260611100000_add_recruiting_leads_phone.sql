-- Lead follow-up is phone-first now; email prefills from Clerk.
-- Nullable so existing email-only leads stay valid.
alter table public.recruiting_leads add column if not exists phone text;
