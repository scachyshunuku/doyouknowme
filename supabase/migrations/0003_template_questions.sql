-- Rewrite seeded question texts to use the {subject} template variable
-- (see lib/template.ts). Question ids are unchanged, so package_questions
-- and game_questions associations are unaffected.
update public.questions set text = 'What is {subject}''s favourite food?' where text = 'What is my favourite food?';
update public.questions set text = 'What is {subject}''s dream vacation?' where text = 'What is my dream vacation?';
update public.questions set text = 'What is {subject}''s favourite movie genre?' where text = 'What is my favourite movie genre?';
update public.questions set text = 'What is {subject}''s ideal weekend?' where text = 'What is my ideal weekend?';
update public.questions set text = 'What is {subject}''s go-to drink?' where text = 'What is my go-to drink?';
update public.questions set text = 'What is {subject}''s favourite season?' where text = 'What is my favourite season?';
update public.questions set text = 'What pet would {subject} most want?' where text = 'What pet would I most want?';
update public.questions set text = 'What is {subject}''s favourite way to travel?' where text = 'What is my favourite way to travel?';
update public.questions set text = 'What is {subject}''s superpower of choice?' where text = 'What is my superpower of choice?';
update public.questions set text = 'What is {subject}''s favourite dessert?' where text = 'What is my favourite dessert?';
update public.questions set text = 'What is {subject}''s favourite colour?' where text = 'What is the test subject''s favourite colour?';
update public.questions set text = 'What is {subject}''s favourite animal?' where text = 'What is the test subject''s favourite animal?';
update public.questions set text = 'What is {subject}''s ideal test day?' where text = 'What is the test subject''s ideal test day?';
update public.questions set text = 'What snack would {subject} pick?' where text = 'What snack would the test subject pick?';
