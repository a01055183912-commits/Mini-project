create table if not exists classes (
  id serial primary key,
  code text unique not null,
  title text not null default '3-8 마케팅 벤치마킹',
  teacher_pw_hash text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  class_id int not null references classes(id) on delete cascade,
  team_id text not null,
  name text not null,
  display_name text not null,
  role text not null default 'student',
  token text unique not null,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists members_class_team on members(class_id, team_id);
create table if not exists answers (
  id bigserial primary key,
  class_id int not null references classes(id) on delete cascade,
  team_id text not null,
  member_id uuid not null references members(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  unique (member_id, key)
);
create index if not exists answers_team on answers(class_id, team_id);
create table if not exists answers_history (
  id bigserial primary key,
  member_id uuid not null references members(id) on delete cascade,
  key text not null,
  value jsonb not null,
  saved_at timestamptz not null default now()
);
create table if not exists finals (
  id bigserial primary key,
  class_id int not null references classes(id) on delete cascade,
  team_id text not null,
  key text not null,
  value jsonb not null,
  source_member_id uuid references members(id) on delete set null,
  decided_by uuid references members(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (class_id, team_id, key)
);
create table if not exists votes (
  class_id int not null references classes(id) on delete cascade,
  team_id text not null,
  member_id uuid not null references members(id) on delete cascade,
  key text not null,
  target_member_id uuid not null references members(id) on delete cascade,
  primary key (member_id, key)
);
create table if not exists feedback (
  id bigserial primary key,
  class_id int not null references classes(id) on delete cascade,
  team_id text not null,
  key text,
  body text not null,
  created_at timestamptz not null default now()
);
create table if not exists visited (
  id bigserial primary key,
  member_id uuid not null references members(id) on delete cascade,
  url text not null,
  title text,
  question_key text,
  opened_at timestamptz not null default now()
);
create index if not exists visited_member on visited(member_id, opened_at desc);
