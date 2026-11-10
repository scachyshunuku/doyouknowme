-- DRAFT — NOT APPLIED. Do not run without William's explicit approval
-- (repo AGENTS.md: stop for review before applying any SQL).
-- Seed the "How Well Do You Know Julie?" package for doyouknowme.
-- Source of truth for the wording: workspace/goals/doyouknowme-party-game/files/julie-question-list.md
-- (8 questions confirmed Nov 8, 2026; Q4 still needs William's pick, A/B/C/D).
--
-- Notes:
-- * Follows supabase/seed_packages.sql pattern: every insert is guarded by
--   `not exists`, so it is safe to re-run.
-- * Package order here is the seed order. At Start the game copies the
--   package into the game and shuffles the bank copy once (Task 13), so
--   play order is shuffled, not this file's order.
-- * Limits after migration 0011: question text <= 300 chars, each option
--   <= 150 chars, exactly 4 options. All questions below are far under.
-- * "Tom San Ramen" is kept verbatim from William's list (ramen, not sushi).

-- Package
insert into public.question_packages (name)
select 'How Well Do You Know Julie?'
where not exists (select 1 from public.question_packages where name = 'How Well Do You Know Julie?');

-- Q1 — favourite sushi place locally
insert into public.questions (text, options)
select 'What is {subject}''s favourite sushi place locally?', '["Tom San Ramen", "Amami Sushi", "Ultra Sushi", "Megamart"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {subject}''s favourite sushi place locally?');

-- Q2 — favourite country for city life
insert into public.questions (text, options)
select 'What is {subject}''s favourite country for city life?', '["China", "Thailand", "Japan", "Vietnam"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {subject}''s favourite country for city life?');

-- Q3 — favourite country for nature
insert into public.questions (text, options)
select 'What is {subject}''s favourite country for nature?', '["New Zealand", "Norway", "Iceland", "Australia"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {subject}''s favourite country for nature?');

-- Q4 — which one to give up when travelling? PICK ONE VERSION (A/B/C/D), uncomment it, delete the rest.
-- Version A — comforts
-- insert into public.questions (text, options)
-- select 'What would {subject} give up first when travelling?', '["A good night''s sleep", "Good food", "A hot shower", "WiFi"]'::jsonb
-- where not exists (select 1 from public.questions where text = 'What would {subject} give up first when travelling?');
-- Version B — flight / logistics
-- insert into public.questions (text, options)
-- select 'What would {subject} give up first when travelling?', '["A window seat", "A checked bag", "A direct flight", "Lounge access"]'::jsonb
-- where not exists (select 1 from public.questions where text = 'What would {subject} give up first when travelling?');
-- Version C — daily habits
-- insert into public.questions (text, options)
-- select 'What would {subject} give up first when travelling?', '["Coffee", "Her skincare routine", "Snacks", "Phone charging / screen time"]'::jsonb
-- where not exists (select 1 from public.questions where text = 'What would {subject} give up first when travelling?');
-- Version D — food & routine
-- insert into public.questions (text, options)
-- select 'What would {subject} give up first when travelling?', '["Eating on schedule", "Working out", "Her usual bedtime", "Familiar food"]'::jsonb
-- where not exists (select 1 from public.questions where text = 'What would {subject} give up first when travelling?');

-- Q5 — ideal bedtime
insert into public.questions (text, options)
select 'What is {subject}''s ideal bedtime?', '["10:00pm", "10:30pm", "11:00pm", "11:30pm"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is {subject}''s ideal bedtime?');

-- Q6 — worst thing about a hotel stay
insert into public.questions (text, options)
select 'What bothers {subject} most about a hotel stay?', '["A strange smell", "Noise", "An uncomfortable bed", "A dirty bathroom"]'::jsonb
where not exists (select 1 from public.questions where text = 'What bothers {subject} most about a hotel stay?');

-- Q7 — splurge first
insert into public.questions (text, options)
select 'What would {subject} splurge on first?', '["Flight", "Hotel", "Food", "Shopping"]'::jsonb
where not exists (select 1 from public.questions where text = 'What would {subject} splurge on first?');

-- Q8 — bug most afraid of
insert into public.questions (text, options)
select 'What bug is {subject} most afraid of?', '["Cockroaches", "Spiders", "Centipedes", "Mice"]'::jsonb
where not exists (select 1 from public.questions where text = 'What bug is {subject} most afraid of?');

-- Associate the questions to the package, in defined order (order_index 0-based).
-- Uncomment the Q4 row once a version is picked; it takes order_index 3.
insert into public.package_questions (question_package_id, question_id, order_index)
select p.id, q.id, v.ord
from public.question_packages p
join (values
  ('What is {subject}''s favourite sushi place locally?', 0),
  ('What is {subject}''s favourite country for city life?', 1),
  ('What is {subject}''s favourite country for nature?', 2),
--  ('What would {subject} give up first when travelling?', 3),
  ('What is {subject}''s ideal bedtime?', 4),
  ('What bothers {subject} most about a hotel stay?', 5),
  ('What would {subject} splurge on first?', 6),
  ('What bug is {subject} most afraid of?', 7)
) as v(text, ord) on true
join public.questions q on q.text = v.text
where p.name = 'How Well Do You Know Julie?'
and not exists (select 1 from public.package_questions pq where pq.question_package_id = p.id and pq.question_id = q.id);
