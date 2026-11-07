-- Seed 10 generic "do you know me" questions. Run after 0001_init.sql.
-- Safe to re-run: it only inserts when the questions table is empty.
insert into public.questions (text, options)
select * from (values
  ('What is my favourite food?', '["Pizza", "Sushi", "Tacos", "Pasta"]'::jsonb),
  ('What is my dream vacation?', '["Beach resort", "Mountain cabin", "Big city trip", "Road trip"]'::jsonb),
  ('What is my favourite movie genre?', '["Comedy", "Action", "Horror", "Romance"]'::jsonb),
  ('What is my ideal weekend?', '["Sleeping in", "Hiking outdoors", "Brunch with friends", "Video games"]'::jsonb),
  ('What is my go-to drink?', '["Coffee", "Tea", "Boba", "Soda"]'::jsonb),
  ('What is my favourite season?', '["Spring", "Summer", "Autumn", "Winter"]'::jsonb),
  ('What pet would I most want?', '["Dog", "Cat", "Bird", "No pets"]'::jsonb),
  ('What is my favourite way to travel?', '["Plane", "Train", "Car", "Boat"]'::jsonb),
  ('What is my superpower of choice?', '["Flying", "Invisibility", "Time travel", "Mind reading"]'::jsonb),
  ('What is my favourite dessert?', '["Ice cream", "Cake", "Cookies", "Fruit"]'::jsonb)
) as v(text, options)
where not exists (select 1 from public.questions);
