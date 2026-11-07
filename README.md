# Do You Know Me?

A simple party room game. Join with a 6-letter code. One host, one subject (the main person), any number of guests.

## How a game works

1. Host creates a room, enters their name and the subject's name, and shares the code.
2. The subject joins with the code and picks the Subject role. Guests join with the code as Guest.
3. Host hits Start Game. The app picks 10 questions from Supabase, in random order.
4. **Question stage:** the question and 4 answers are on screen. Everyone except the host picks an answer, including the subject. The host does nothing here.
5. **Results stage:** shown automatically when everyone non-host has submitted, or when the host hits Override to Results. Per-answer counts are shown, with the subject's pick and the majority pick marked.
   - Match the subject: +2 points
   - Match the majority: +1 point
   - Maximum 3 points per question. Subject scores 0, host scores 0.
   - Majority is among all non-host answers submitted, including the subject. If two or more options tie for most-chosen, all tied options count as majority.
   - If the subject did not answer before the host overrode to Results, no one gets the +2, but the +1 majority point still applies.
6. Host hits Next Question to go back to stage 4, until all questions are done.
7. **Final leaderboard:** total points, plus a separate stat for most matches with the subject (count, not points).

No user accounts. Players are identified by name + a player id stored in localStorage on their device.

## Tech

- Next.js 15 App Router, TypeScript, React 19
- Supabase Postgres + Realtime (rooms, players, answers)
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
2. Run `supabase/migrations/0001_init.sql` first. It creates rooms, players, questions, room_questions and answers, enables RLS with permissive anon policies, and enables Realtime for rooms, players, answers and room_questions.
3. Run `supabase/seed.sql` next. It inserts 10 generic questions, only if the questions table is empty.
4. Project Settings > API gives you the URL and anon key for `.env.local` / Vercel.

## Vercel env vars

Set these on the doyouknowme Vercel project, for Production and Preview:

- `NEXT_PUBLIC_SUPABASE_URL` — e.g. https://your-project-ref.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon / publishable key from Supabase

Do not use the service role key in the browser app. Redeploy after setting env vars.

## Files

- `app/page.tsx` — home, create / join room
- `app/room/[code]/page.tsx` — room, lobby, question, results, final leaderboard, host controls, Realtime subscriptions, auto-advance to Results
- `lib/supabase.ts` — browser Supabase client, room code generator
- `lib/scoring.ts` — scoring logic and totals
- `lib/types.ts` — Room, Player, Question, Answer types
- `supabase/migrations/0001_init.sql` — schema, RLS, Realtime
- `supabase/seed.sql` — 10 seed questions
