-- Enable RLS on all tables.
-- All app access goes through service_role key (bypasses RLS),
-- so no additional policies are needed. Anon/public access is blocked entirely.

alter table if exists jd_history enable row level security;
alter table if exists questionnaires enable row level security;
alter table if exists questionnaire_answers enable row level security;
alter table if exists connected_accounts enable row level security;
alter table if exists post_campaigns enable row level security;
alter table if exists feedback enable row level security;
alter table if exists api_usage enable row level security;
