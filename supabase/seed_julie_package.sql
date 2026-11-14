-- APPLIED Nov 14, 2026 to Supabase project fmmsnucnfuvyjkgszqjn (doyouknowme),
-- verified: package "For Julie" with 10 questions in order 0–9.
-- Safe to re-run: every insert is guarded by `not exists`.
-- Seed the "For Julie" package for doyouknowme.
-- Source of truth for the wording: workspace/goals/doyouknowme-party-game/files/julie-question-list.md
-- (10 questions confirmed; reordered Nov 14, 2026 to 9, 1, 2, 3, 6, 4, 5, 10, 8, 7.)
--
-- Notes:
-- * Follows supabase/seed_packages.sql pattern: every insert is guarded by
--   `not exists`, so it is safe to re-run.
-- * Package order here is the seed order, and it is also the play order:
--   at Start the game copies the package into the game in this order
--   (bank questions play in package order since Task 41).
-- * Limits after migration 0011: question text <= 300 chars, each option
--   <= 150 chars, exactly 4 options. All questions below are far under.
-- * "Tom San Ramen" is kept verbatim from William's list (ramen, not sushi).

-- Package
insert into public.question_packages (name)
select 'For Julie'
where not exists (select 1 from public.question_packages where name = 'For Julie');

-- Q1 — favourite vegetable
insert into public.questions (text, options)
select 'What is {star}''s favourite vegetable?', '["Tomato", "Napa cabbage", "Corn", "Eggplant"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {star}''s favourite vegetable?');

-- Q2 — favourite local sushi place
insert into public.questions (text, options)
select 'What is {star}''s favourite local sushi place?', '["Tom San Ramen", "Amami Sushi", "Ultra Sushi", "Mega Mart"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {star}''s favourite local sushi place?');

-- Q3 — favourite country for city life
insert into public.questions (text, options)
select 'What is {star}''s favourite country for city life?', '["China", "Thailand", "Japan", "Vietnam"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {star}''s favourite country for city life?');

-- Q4 — favourite country for nature
insert into public.questions (text, options)
select 'What is {star}''s favourite country for nature?', '["New Zealand", "Norway", "Iceland", "Switzerland"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {star}''s favourite country for nature?');

-- Q5 — worst thing about a hotel stay
insert into public.questions (text, options)
select 'What bothers {star} most about a hotel stay?', '["A strange smell", "Noise", "An uncomfortable bed", "A dirty bathroom"]'::jsonb
where not exists (select 1 from public.questions where text = 'What bothers {star} most about a hotel stay?');

-- Q6 — ideal bedtime
insert into public.questions (text, options)
select 'What is {star}''s ideal bedtime?', '["10:00pm", "10:30pm", "11:00pm", "11:30pm"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {star}''s ideal bedtime?');

-- Q7 — favourite hobby
insert into public.questions (text, options)
select 'What is {star}''s favourite hobby?', '["Hiking", "Watching reality TV", "Hanging out with friends", "Eating food"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {star}''s favourite hobby?');

-- Q8 — social media app used most
insert into public.questions (text, options)
select 'What social media app does {star} use the most?', '["Instagram", "Xiaohongshu (RedNote)", "TikTok", "YouTube Shorts"]'::jsonb
where not exists (select 1 from public.questions where text = 'What social media app does {star} use the most?');

-- Q9 — bug most afraid of
insert into public.questions (text, options)
select 'What bug is {star} most afraid of?', '["Cockroaches", "Spiders", "Centipedes", "Mice"]'::jsonb
where not exists (select 1 from public.questions where text = 'What bug is {star} most afraid of?');

-- Q10 — splurge first
insert into public.questions (text, options)
select 'What would {star} splurge on first?', '["Business class vs economy flight", "Luxury vs regular hotel", "Gourmet vs standard food", "Top tier vs standard health and beauty products"]'::jsonb
where not exists (select 1 from public.questions where text = 'What would {star} splurge on first?');

-- Associate the questions to the package, in defined order (order_index 0-based).
insert into public.package_questions (question_package_id, question_id, order_index)
select p.id, q.id, v.ord
from public.question_packages p
join (values
  ('What is {star}''s favourite vegetable?', 0),
  ('What is {star}''s favourite local sushi place?', 1),
  ('What is {star}''s favourite country for city life?', 2),
  ('What is {star}''s favourite country for nature?', 3),
  ('What bothers {star} most about a hotel stay?', 4),
  ('What is {star}''s ideal bedtime?', 5),
  ('What is {star}''s favourite hobby?', 6),
  ('What social media app does {star} use the most?', 7),
  ('What bug is {star} most afraid of?', 8),
  ('What would {star} splurge on first?', 9)
) as v(text, ord) on true
join public.questions q on q.text = v.text
where p.name = 'For Julie'
and not exists (select 1 from public.package_questions pq where pq.question_package_id = p.id and pq.question_id = q.id);
