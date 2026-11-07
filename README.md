# Do You Know Me?

A simple party game. Join a game with a 6-letter code. One host, one subject (the main person), any number of guests.

## Terminology

- **Question Package**: a named list of questions, with a name (required) and a category (optional). Questions are associated to a package and can be reused in more than one package.
- **Game**: one whole round of gameplay. Each game picks one question package and plays through that package's questions in defined order.

## How a game works

1. Host starts a game: enters their name and picks a question package, then shares the code. The host is always the host.
2. Guests join with the code, as guests. There is no join-as-host or join-as-subject.
3. In the lobby, the host picks one guest to be the subject ("Make subject"). Only one subject per game; picking a different guest replaces the old one. The game cannot start until a subject is picked.
4. Host hits Start Game. The app copies that package's questions, in defined order, into the game. No random pick, no fixed count, no shuffle.
5. **Question stage:** the question and 4 answers are on screen. Everyone except the host picks an answer, including the subject. The host does nothing here and cannot see any player's chosen answer, including the subject's, until Results. After a player answers, they go to a waiting screen ("Answer locked in. Waiting for everyone else…") with no option to go back or change the answer.
6. **Results stage:** shown automatically when everyone non-host has submitted, or when the host hits Override to Results. Per-answer counts are shown, with the subject's pick and the majority pick marked.
   - Match the subject: +2 points
   - Match the majority: +1 point
   - Maximum 3 points per question. Subject scores 0, host scores 0.
   - Majority is among all non-host answers submitted, including the subject. If two or more options tie for most-chosen, all tied options count as majority.
   - If the subject did not answer before the host overrode to Results, no one gets the +2, but the +1 majority point still applies.
   - Players who did not answer get 0 for that question and do not count as a vote.
7. Host hits Next Question to go back to stage 5, until all questions are done.
8. **Final leaderboard:** total points, plus a separate stat for most matches with the subject (count, not points). Ties are shown together.

No user accounts. Players are identified by name + a player id stored in localStorage on their device, under `doyouknowme:session:<CODE>`. If a player refreshes, closes the tab, or loses connection, that session restores them as the same player, with the same role, answers, and score — no new player row is created. There is no host transfer; the host stays connected via that session.

## Tech

- Next.js 15 App Router, TypeScript, React 19
- Supabase Postgres + Realtime (question_packages, package_questions, questions, games, players, game_questions, answers)
- Scoring in `lib/scoring.ts` — see the comments there for the exact rules and edge cases
- Deploy target: Vercel

## Run locally

```bash
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open http://localhost:3000

## Supabase setup

1. In the Supabase Dashboard, open the doyouknowme project, then SQL Editor.
2. Run `supabase/migrations/0001_init.sql` first. It creates rooms, players, questions, room_questions and answers, enables RLS with permissive anon policies, and enables Realtime.
3. Run `supabase/migrations/0002_packages.sql` next. It adds question_packages and package_questions, renames rooms to games and room_questions to game_questions, and adds the one-host / one-subject partial unique indexes.
4. Run `supabase/seed.sql` (the 10 generic questions) and `supabase/seed_packages.sql` next. The seed creates the "Get to Know Me" package (General, 10 questions) and a "Test Package" (Test, 5 questions, one reused from the default package).
5. Project Settings > API gives you the URL and anon key for `.env.local` / Vercel.

## Vercel env vars

Set these on the doyouknowme Vercel project, for Production and Preview:

- `NEXT_PUBLIC_SUPABASE_URL` — e.g. https://your-project-ref.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon / publishable key from Supabase

Do not use the service role key in the browser app. Redeploy after setting env vars.

## Files

- `app/page.tsx` — home, start / join a game, question package picker
- `app/game/[code]/page.tsx` — game, lobby, subject picker, question, waiting screen, results, final leaderboard, host controls, Realtime subscriptions, session restore, auto-advance to Results
- `lib/supabase.ts` — browser Supabase client, game code generator
- `lib/scoring.ts` — scoring logic and totals
- `lib/types.ts` — QuestionPackage, Game, Player, Question, GameQuestion, Answer types
- `supabase/migrations/0001_init.sql` — initial schema, RLS, Realtime
- `supabase/migrations/0002_packages.sql` — question packages, games rename, role indexes
- `supabase/seed.sql` — 10 seed questions
- `supabase/seed_packages.sql` — "Get to Know Me" and "Test Package" seeds
