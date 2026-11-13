-- Migration 0013: answer visibility (security).
--
-- Problem: the answers table had an "anon all" RLS policy (qual true), so
-- anyone with the public anon key could read every player's answer
-- (player_id + option_index) for every question — including the current
-- unrevealed question — by querying the Supabase REST API or watching the
-- Realtime websocket. The host-blind rule ("host sees nothing until
-- Results") was UI-only. Verified Nov 12, 2026: an outsider with only the
-- anon key read Sam's answer (option 0) from game B56WTD before Results.
--
-- Fix, in two parts:
--   (a) RLS on answers: SELECT is allowed only once a question has been
--       revealed — either the game has moved past it (order_index <
--       current_question_index) or the game is showing its Results
--       (order_index = current_question_index AND status in
--       ('results','finished')). INSERT stays open (anyone in the game can
--       submit); UPDATE/DELETE have no policy, so they are denied.
--   (b) A submitted_count on game_questions, maintained by a trigger, so
--       the client can show "N/M answered" and auto-advance without ever
--       reading the answers rows. One answer per player per question is
--       enforced by the UNIQUE constraint, so the count equals the number
--       of distinct submitters.
-- The client remembers its own pick locally (state + localStorage) for the
-- waiting screen, because it can no longer read its own unrevealed answer
-- back from the table.

-- (b) Count of answers per game question.
alter table public.game_questions
  add column if not exists submitted_count integer not null default 0;

-- Keep submitted_count in step with the answers table. SECURITY DEFINER so
-- the trigger can update game_questions even though the inserting role is
-- anon (the trigger runs as the function owner and bypasses RLS).
create or replace function public.maintain_submitted_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.game_questions
      set submitted_count = submitted_count + 1
      where id = new.game_question_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.game_questions
      set submitted_count = greatest(submitted_count - 1, 0)
      where id = old.game_question_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists answers_submitted_count on public.answers;
create trigger answers_submitted_count
  after insert or delete on public.answers
  for each row execute function public.maintain_submitted_count();

-- Backfill for answers that already exist (test games).
update public.game_questions gq
  set submitted_count = (
    select count(*) from public.answers a where a.game_question_id = gq.id
  );

-- (a) Replace the open "anon all" policy on answers with least-privilege
-- policies. INSERT stays open; SELECT only once the question is revealed.
drop policy if exists "anon all" on public.answers;

create policy "anon insert answers"
  on public.answers
  for insert
  to anon
  with check (true);

create policy "anon select revealed answers"
  on public.answers
  for select
  to anon
  using (
    exists (
      select 1
      from public.game_questions gq
      join public.games g on g.id = gq.game_id
      where gq.id = answers.game_question_id
        and (
          gq.order_index < g.current_question_index
          or (gq.order_index = g.current_question_index and g.status in ('results', 'finished'))
        )
    )
  );
