-- Reachr schema. Paste into Supabase SQL editor. RLS stays off.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text,
  background text,
  agent37_instance_id text,
  agent37_url text,
  session_id text
);

create table if not exists user_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text check (type in ('project','achievement','skill','link')),
  title text,
  one_liner text,
  url text,
  tags text[]
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  goal text,
  status text,
  agent_cost_usd numeric default 0,
  monid_cost_usd numeric default 0,
  openai_cost_usd numeric default 0,
  created_at timestamptz default now()
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  name text,
  title text,
  org text,
  platform text,
  source_url text,
  evidence text,
  fit int,
  reply_reason int,
  recency int,
  reachability int,
  total int,
  hook text,
  email text,
  channel text check (channel in ('email','linkedin_dm')),
  subject text,
  body text,
  used_evidence text,
  used_assets text[],
  status text default 'suggested' check (status in ('suggested','contacted','replied')),
  created_at timestamptz default now()
);

-- One seeded demo user (fixed id, see lib/db.ts).
insert into users (id, name, background)
values ('00000000-0000-0000-0000-000000000001', 'Demo User', 'Student building AI agents')
on conflict (id) do nothing;
