-- Task 13: game questions are self-contained copies.
-- game_questions now stores the full question (text + options) and marks
-- guest contributions with is_custom, so a game question can be added
-- without touching the shared questions bank — the questions table is the
-- bank only (package_questions still references it). answers points at
-- the game question row (game_question_id) instead of the bank question.
--
-- Backfills: every existing game_questions row references a real questions
-- row (bank copies and customs alike — customs were inserted into
-- questions before this migration), so text/options copy over cleanly.
-- Customs are the rows that lived at order_index >= 1000. Every existing
-- answer matches exactly one game_questions row via (game_id, question_id).

-- 1. game_questions: surrogate id + the copied content + is_custom.
alter table public.game_questions
  add column id uuid not null default gen_random_uuid(),
  add column text text,
  add column options jsonb,
  add column is_custom boolean not null default false;

-- 2. Backfill the copies from the bank.
update public.game_questions gq
set text = q.text, options = q.options
from public.questions q
where q.id = gq.question_id;

-- 3. Customs lived at order_index >= 1000; mark them.
update public.game_questions set is_custom = true where order_index >= 1000;

-- 4. Content is required and validated from here on (same limits as the
--    bank: text <= 140, options exactly 4 strings <= 50).
alter table public.game_questions
  alter column text set not null,
  alter column options set not null,
  add constraint game_questions_text_length check (char_length(text) <= 140),
  add constraint game_questions_options_valid check (public.options_are_valid(options));

-- 5. The surrogate id becomes the primary key; (game_id, order_index)
--    stays unique so the play order is still one row per slot.
alter table public.game_questions drop constraint room_questions_pkey;
alter table public.game_questions add primary key (id);
alter table public.game_questions add constraint game_questions_game_order_unique unique (game_id, order_index);

-- 6. answers: point at the game question row.
alter table public.answers add column game_question_id uuid;
update public.answers a
set game_question_id = gq.id
from public.game_questions gq
where gq.game_id = a.game_id and gq.question_id = a.question_id;
alter table public.answers alter column game_question_id set not null;
alter table public.answers
  add constraint answers_game_question_id_fkey foreign key (game_question_id) references public.game_questions(id) on delete cascade,
  add constraint answers_game_question_unique unique (game_id, game_question_id, player_id);

-- 7. Drop the bank link from both tables (dropping the columns also drops
--    their foreign keys and the old unique constraints).
alter table public.answers drop column question_id;
alter table public.game_questions drop column question_id;

-- 8. finish_contribution, rewritten for the new shape: the custom shuffle
--    now works on is_custom rows (identified by id, not question_id) and
--    places them right after the bank — consecutive slots starting at the
--    bank count, in random order. The park-at-20000+ trick still keeps the
--    (game_id, order_index) unique constraint intact mid-swap.
create or replace function public.finish_contribution(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_count int;
  v_bank int;
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
  -- Shuffle the custom questions (is_custom) once, right after the bank.
  select count(*) into v_bank from public.game_questions where game_id = p_game_id and not is_custom;
  update public.game_questions gq
  set order_index = 20000 + s.rn - 1
  from (
    select id, row_number() over (order by random()) as rn
    from public.game_questions
    where game_id = p_game_id and is_custom
  ) s
  where gq.game_id = p_game_id and gq.id = s.id;
  update public.game_questions
  set order_index = order_index - 20000 + v_bank
  where game_id = p_game_id and order_index >= 20000;
  update public.games
  set status = 'question', current_question_index = 0
  where id = p_game_id;
  return true;
end;
$$;

grant execute on function public.finish_contribution(uuid) to anon;
