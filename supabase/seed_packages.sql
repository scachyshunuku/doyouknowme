-- Seed question packages. Run after 0002_packages.sql.
-- Safe to re-run: every insert is guarded by not exists.
-- Default package: the 10 existing generic questions, in their original order.
-- Test package: 4 new test questions plus 1 reused question, to prove
-- a question can be in more than one package.

-- Default package
insert into public.question_packages (name, category)
select 'Get to Know Me', 'General'
where not exists (select 1 from public.question_packages where name = 'Get to Know Me');

-- Test package
insert into public.question_packages (name, category)
select 'Test Package', 'Test'
where not exists (select 1 from public.question_packages where name = 'Test Package');

-- Test questions (new)
insert into public.questions (text, options)
select 'What is the test subject''s favourite colour?', '["Red", "Blue", "Green", "Yellow"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is the test subject''s favourite colour?');

insert into public.questions (text, options)
select 'What is the test subject''s favourite animal?', '["Dog", "Cat", "Penguin", "Owl"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is the test subject''s favourite animal?');

insert into public.questions (text, options)
select 'What is the test subject''s ideal test day?', '["Beach", "Mountains", "City", "Staying home"]'::jsonb
where not exists (select 1 from public.questions where text = 'What is the test subject''s ideal test day?');

insert into public.questions (text, options)
select 'What snack would the test subject pick?', '["Chips", "Popcorn", "Fruit", "Chocolate"]'::jsonb
where not exists (select 1 from public.questions where text = 'What snack would the test subject pick?');

-- Associate the 10 existing questions to the default package, in defined order.
-- order_index is 0-based. Do not order by created_at: the 10 were seeded in
-- one insert, so their timestamps tie and that order is not reliable.
insert into public.package_questions (question_package_id, question_id, order_index)
select p.id, q.id, v.ord
from public.question_packages p
join (values
  ('What is my favourite food?', 0),
  ('What is my dream vacation?', 1),
  ('What is my favourite movie genre?', 2),
  ('What is my ideal weekend?', 3),
  ('What is my go-to drink?', 4),
  ('What is my favourite season?', 5),
  ('What pet would I most want?', 6),
  ('What is my favourite way to travel?', 7),
  ('What is my superpower of choice?', 8),
  ('What is my favourite dessert?', 9)
) as v(text, ord) on true
join public.questions q on q.text = v.text
where p.name = 'Get to Know Me'
and not exists (select 1 from public.package_questions pq where pq.question_package_id = p.id and pq.question_id = q.id);

-- Associate the 5 test questions to the test package, in defined order.
-- The 5th one reuses the existing season question from the default package.
insert into public.package_questions (question_package_id, question_id, order_index)
select p.id, q.id, v.ord
from public.question_packages p
join (values
  ('What is the test subject''s favourite colour?', 0),
  ('What is the test subject''s favourite animal?', 1),
  ('What is the test subject''s ideal test day?', 2),
  ('What snack would the test subject pick?', 3),
  ('What is my favourite season?', 4)
) as v(text, ord) on true
join public.questions q on q.text = v.text
where p.name = 'Test Package'
and not exists (select 1 from public.package_questions pq where pq.question_package_id = p.id and pq.question_id = q.id);
