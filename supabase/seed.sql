-- Seed 10 generic "do you know me" questions. Run after 0001_init.sql.
-- Safe to re-run: it only inserts when the questions table is empty.
-- Question text can use {subject}, which is replaced with the subject's name
-- when the question is shown (see lib/template.ts).
insert into public.questions (text, options)
select * from (values
  ('What is {subject}''s favourite food?', '["Pizza", "Sushi", "Tacos", "Pasta"]'::jsonb),
  ('What is {subject}''s dream vacation?', '["Beach resort", "Mountain cabin", "Big city trip", "Road trip"]'::jsonb),
  ('What is {subject}''s favourite movie genre?', '["Comedy", "Action", "Horror", "Romance"]'::jsonb),
  ('What is {subject}''s ideal weekend?', '["Sleeping in", "Hiking outdoors", "Brunch with friends", "Video games"]'::jsonb),
  ('What is {subject}''s go-to drink?', '["Coffee", "Tea", "Boba", "Soda"]'::jsonb),
  ('What is {subject}''s favourite season?', '["Spring", "Summer", "Autumn", "Winter"]'::jsonb),
  ('What pet would {subject} most want?', '["Dog", "Cat", "Bird", "No pets"]'::jsonb),
  ('What is {subject}''s favourite way to travel?', '["Plane", "Train", "Car", "Boat"]'::jsonb),
  ('What is {subject}''s superpower of choice?', '["Flying", "Invisibility", "Time travel", "Mind reading"]'::jsonb),
  ('What is {subject}''s favourite dessert?', '["Ice cream", "Cake", "Cookies", "Fruit"]'::jsonb)
) as v(text, options)
where not exists (select 1 from public.questions);
