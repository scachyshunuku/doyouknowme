-- doyouknowme migration 0008: server-side content limits, limit 0-10, question author
-- The length caps (name 25, question 140, choice 50) were UI-only; enforce
-- them in the database so a direct API call cannot store a multi-megabyte
-- name/question or a malformed options array. Existing data was checked
-- Nov 9, 2026 before adding these: max name 11, max question text 44,
-- max option 19, min question index 0, 0 bad codes, 0 bad option arrays.
alter table public.players
  add constraint players_name_length check (char_length(name) <= 25);

alter table public.questions
  add constraint questions_text_length check (char_length(text) <= 140);

-- Options must be exactly 4 strings, each <= 50 chars. A CHECK cannot hold
-- a subquery, so the test lives in an immutable function (CASE evaluates
-- lazily, so array_length is only called on actual arrays).
create or replace function public.options_are_valid(opts jsonb) returns boolean
language sql immutable as $$
  select case
    when jsonb_typeof(opts) <> 'array' then false
    when jsonb_array_length(opts) <> 4 then false
    else (select bool_and(jsonb_typeof(el) = 'string' and char_length(el #>> '{}') <= 50)
          from jsonb_array_elements(opts) as el)
  end
$$;

alter table public.questions
  add constraint questions_options_valid check (public.options_are_valid(options));

-- Game codes are 6 chars from the generator's alphabet (no I/O/0/1).
alter table public.games
  add constraint games_code_format check (code ~ '^[A-Z2-9]{6}$');

alter table public.games
  add constraint games_current_question_index_nonnegative check (current_question_index >= 0);

-- Per-guest custom-question limit is now 0-10 (was 0-5).
alter table public.games drop constraint if exists games_custom_question_limit_check;
alter table public.games
  add constraint games_custom_question_limit_check check (custom_question_limit between 0 and 10);

-- Record who added each custom question, so the per-guest limit is
-- checkable and the author is known. (The wizard slot itself still lives
-- in localStorage, because a skipped slot has no row to count.)
alter table public.game_questions
  add column if not exists created_by_player_id uuid references public.players(id) on delete set null;
