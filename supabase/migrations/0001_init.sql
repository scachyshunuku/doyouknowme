-- doyouknowme initial schema
-- Apply in Supabase Dashboard > SQL Editor, then run supabase/seed.sql.
-- Party game, no auth: RLS is enabled with permissive anon policies.
-- Realtime is enabled for rooms, players and answers so every phone updates live.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_player_id uuid,
  subject_player_id uuid,
  subject_name text,
  status text not null default 'lobby' check (status in ('lobby', 'question', 'results', 'finished')),
  current_question_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  role text not null check (role in ('host', 'subject', 'guest')),
  joined_at timestamptz not null default now()
);
create index if not exists idx_players_room_id on public.players(room_id);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  options jsonb not null,
  created_at timestamptz not null default now(),
  constraint questions_four_options check (jsonb_array_length(options) = 4)
);

create table if not exists public.room_questions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  order_index int not null,
  primary key (room_id, order_index),
  unique (room_id, question_id)
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  option_index int not null check (option_index >= 0 and option_index <= 3),
  created_at timestamptz not null default now(),
  unique (room_id, question_id, player_id)
);
create index if not exists idx_answers_room_question on public.answers(room_id, question_id);

-- Scores are computed in app code (lib/scoring.ts), not stored redundantly.
-- If you later want a cached total, add players.total_points int default 0
-- and update it only when a round moves to results.

-- Row Level Security: permissive for anon, this is a party game with no accounts.
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.questions enable row level security;
alter table public.room_questions enable row level security;
alter table public.answers enable row level security;

drop policy if exists "anon all" on public.rooms;
create policy "anon all" on public.rooms for all to anon using (true) with check (true);
drop policy if exists "anon all" on public.players;
create policy "anon all" on public.players for all to anon using (true) with check (true);
drop policy if exists "anon all" on public.questions;
create policy "anon all" on public.questions for all to anon using (true) with check (true);
drop policy if exists "anon all" on public.room_questions;
create policy "anon all" on public.room_questions for all to anon using (true) with check (true);
drop policy if exists "anon all" on public.answers;
create policy "anon all" on public.answers for all to anon using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.answers;
alter publication supabase_realtime add table public.room_questions;
