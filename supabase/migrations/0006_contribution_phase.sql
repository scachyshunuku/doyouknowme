-- doyouknowme migration 0006: contribution phase before the first question
-- Entering custom questions now happens in the game itself, after the host
-- hits Start and before the first question: a new game status
-- 'contributing'. Each non-host player fills in their own questions one at
-- a time (up to the host's per-guest limit); players.contribution_done marks
-- who has finished, and when everyone is done the game starts.
-- games.custom_questions_required: when true, every guest must fill all of
-- their slots (no Skip). It is forced on for custom-only games (no package),
-- derived in the app as required OR no package.
alter table public.games
  add column if not exists custom_questions_required boolean not null default false;

alter table public.players
  add column if not exists contribution_done boolean not null default false;

-- The status check still carries its old rooms name; widen it to include
-- the new phase.
alter table public.games drop constraint if exists rooms_status_check;
alter table public.games
  add constraint rooms_status_check
  check (status in ('lobby', 'contributing', 'question', 'results', 'finished'));
