-- Play again moves everyone into the new game's lobby. The old game
-- points at the new one; every guest's client follows the pointer and
-- re-joins the new game with the same name and role. Nullable and
-- additive, so the live client (which does not read it yet) is unaffected.
alter table public.games
  add column replay_code text
  check (replay_code is null or replay_code ~ '^[A-Z2-9]{6}$');

comment on column public.games.replay_code is
  'Code of the new game created by Play again. Guests follow it into the new lobby.';
