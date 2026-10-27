create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 50),
  email text not null check (char_length(email) <= 254),
  message text not null check (char_length(message) between 10 and 1000),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

revoke all on table public.feedback from anon, authenticated;
grant insert on table public.feedback to service_role;
