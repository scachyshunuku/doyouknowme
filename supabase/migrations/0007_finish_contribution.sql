-- doyouknowme migration 0007: finish the contribution phase server-side
-- The old client shuffle ran 2N single-row updates from the browser with
-- errors ignored, and any connected client could trigger it — two clients
-- finishing at once could interleave their shuffles and park a question
-- out of order. This function does the whole finish in one transaction:
-- it locks the game row, shuffles the custom questions once (after the
-- package bank), and starts the first question. A second caller finds the
-- status already moved and returns false. The answer choices themselves
-- are already shuffled per game, deterministically, in lib/shuffle.ts.
create or replace function public.finish_contribution(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_count int;
begin
  -- Lock the game row so two callers cannot finish at once; the second
  -- waits, then finds the status already moved and returns false.
  select status into v_status from public.games where id = p_game_id for update;
  if v_status is distinct from 'contributing' then
    return false;
  end if;
  -- A game needs at least one question to start. A custom-only game with
  -- optional questions can end up with none if everyone skipped — then it
  -- goes back to the lobby instead of starting an empty game.
  select count(*) into v_count from public.game_questions where game_id = p_game_id;
  if v_count = 0 then
    update public.games set status = 'lobby' where id = p_game_id;
    return false;
  end if;
  -- Shuffle the custom questions (order_index >= 1000) once, after the
  -- bank, in two statements inside this transaction so the
  -- (game_id, order_index) primary key is never violated mid-swap: park
  -- them all at 20000+ (a range nothing else uses), then assign consecutive
  -- slots from 1000 in random order.
  update public.game_questions gq
  set order_index = 20000 + s.rn - 1
  from (
    select question_id, row_number() over (order by random()) as rn
    from public.game_questions
    where game_id = p_game_id and order_index >= 1000
  ) s
  where gq.game_id = p_game_id and gq.question_id = s.question_id;
  update public.game_questions
  set order_index = order_index - 20000 + 1000
  where game_id = p_game_id and order_index >= 20000;
  update public.games
  set status = 'question', current_question_index = 0
  where id = p_game_id;
  return true;
end;
$$;

grant execute on function public.finish_contribution(uuid) to anon;
