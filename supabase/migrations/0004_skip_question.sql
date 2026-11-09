-- 0004: let the host skip a question (no points scored).
-- A skipped question is filtered out of the game's question list, so it
-- never reaches Results, never counts toward totals, and never shows in
-- the Answer review. The row is kept (not deleted) so the skip is visible
-- in the data and reversible.
alter table public.game_questions
  add column if not exists skipped boolean not null default false;
