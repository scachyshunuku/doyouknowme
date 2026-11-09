-- Task 12: question packages do not need a category. Drop the column.
-- The live rows ("Get to Know Me" / "General", "Test Package" / "Test")
-- lose only their category label; the package names and their questions
-- are untouched. Safe to apply: no code reads this column after this task.
alter table public.question_packages drop column if exists category;
