-- doyouknowme migration 0005: host-set custom-question limit per guest
-- The host chooses how many custom questions each guest may add when they
-- join (0-5, default 1). 0 means guests cannot add questions at all.
-- question_package_id is already nullable (added by 0002), so a game can
-- have no package and play only custom questions; the app requires the
-- limit to be at least 1 in that case (enforced in createGame, not here).
alter table public.games
  add column if not exists custom_question_limit integer not null default 1
  check (custom_question_limit between 0 and 5);
