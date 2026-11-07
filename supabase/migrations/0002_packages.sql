-- doyouknowme migration 0002: question packages + games rename + one host/subject
-- Apply after 0001_init.sql, then run supabase/seed_packages.sql.
-- Terminology: Question Package -> Questions. Game = one whole round of gameplay.
-- Questions are standalone and reusable across packages via package_questions.
-- Games are the old rooms table, renamed. No data is deleted.

-- 1. Question packages
create table if not exists public.question_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.package_questions (
  question_package_id uuid not null references public.question_packages(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  order_index int not null,
  primary key (question_package_id, order_index),
  unique (question_package_id, question_id)
);

alter table public.question_packages enable row level security;
alter table public.package_questions enable row level security;

drop policy if exists "anon all" on public.question_packages;
create policy "anon all" on public.question_packages for all to anon using (true) with check (true);
drop policy if exists "anon all" on public.package_questions;
create policy "anon all" on public.package_questions for all to anon using (true) with check (true);

alter publication supabase_realtime add table public.question_packages;
alter publication supabase_realtime add table public.package_questions;

-- 2. Rename rooms -> games, room_questions -> game_questions
alter table public.rooms rename to games;
alter table public.room_questions rename to game_questions;

alter table public.players rename column room_id to game_id;
alter table public.answers rename column room_id to game_id;
alter table public.game_questions rename column room_id to game_id;

-- 3. Games pick one question package
alter table public.games add column if not exists question_package_id uuid references public.question_packages(id);
alter table public.games alter column host_player_id set not null;

-- 4. Indexes: drop the old room-based ones, add game-based ones
drop index if exists public.idx_players_room_id;
drop index if exists public.idx_answers_room_question;
create index if not exists idx_players_game_id on public.players(game_id);
create index if not exists idx_answers_game_question on public.answers(game_id, question_id);

-- 5. At most one host and at most one subject per game, enforced in the database
create unique index if not exists uniq_one_host_per_game on public.players(game_id) where role = 'host';
create unique index if not exists uniq_one_subject_per_game on public.players(game_id) where role = 'subject';
