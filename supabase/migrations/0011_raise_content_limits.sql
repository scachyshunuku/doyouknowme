-- Task 15: raise the content limits — questions up to 300 chars, each
-- option (answer) up to 150 chars. The UI handles the longer text (smaller
-- fonts for long questions/options, single-column host options when long,
-- tap-to-expand on Results and the answer review), so the caps move up
-- without the layout falling over. Existing data is far under the new
-- limits (max question text 44, max option 19, Nov 9).
alter table public.questions drop constraint questions_text_length;
alter table public.questions
  add constraint questions_text_length check (char_length(text) <= 300);

alter table public.game_questions drop constraint game_questions_text_length;
alter table public.game_questions
  add constraint game_questions_text_length check (char_length(text) <= 300);

-- The options check lives in one function shared by the questions and
-- game_questions CHECKs, so replacing it raises the cap for both tables.
create or replace function public.options_are_valid(opts jsonb) returns boolean
language sql immutable as $$
  select case
    when jsonb_typeof(opts) <> 'array' then false
    when jsonb_array_length(opts) <> 4 then false
    else (select bool_and(jsonb_typeof(el) = 'string' and char_length(el #>> '{}') <= 150)
          from jsonb_array_elements(opts) as el)
  end
$$;
