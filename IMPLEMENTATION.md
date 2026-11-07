# Do You Know Me? - Implementation Plan

Breaking down the build into independently testable tasks. Check items off only when the test in that task passes.

---

## Phase 1: Foundation - Blocking work

These tasks must be completed first as they unblock other work.

### Task 1.1: Project Setup

- [x] Create Next.js 15 project with TypeScript, App Router
- [x] Configure Supabase client in `lib/supabase.ts`
- [x] Set up `.env.example` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] Configure Vercel project `doyouknowme`
- **Blockers**: None
- **Enables**: All other tasks
- **Testability**: `npm run build` passes
- **Status**: Done, build passed

### Task 1.2: Database Schema & Migrations

- [x] Create Supabase project `doyouknowme`, ref `fmmsnucnfuvyjkgszqjn`
- [x] Write initial schema migration `supabase/migrations/0001_init.sql` (rooms, players, questions, room_questions, answers)
- [x] Create indexes on `players(room_id)` and `answers(room_id, question_id)`
- [x] Set up RLS policies, permissive `anon all` for a party game with no accounts
- [x] Enable Realtime for rooms, players, answers, room_questions
- [x] Apply migration to Supabase via the Management API
- **Blockers**: Task 1.1
- **Enables**: Tasks 2.x, 3.x
- **Testability**: `select table_name from information_schema.tables` returns all five tables
- **Status**: Done, all five tables verified in Supabase, superseded by Task 1.5 below

### Task 1.5: Question Packages + Games - Variable-length question lists

- [x] Write migration `supabase/migrations/0002_packages.sql`: add `question_packages` table (id, name, category nullable), add `package_questions` join table (question_package_id, question_id, order_index), add RLS + Realtime for both. Questions are standalone and reusable across packages via that join table.
- [x] Rename the old `rooms` table to `games`, `room_questions` to `game_questions`, and `rooms.game_id` to `games.question_package_id`. Rename `room_id` to `game_id` in players, game_questions, and answers.
- [x] In the same migration, or a `0003_roles.sql`: add partial unique indexes `uniq_one_host_per_game` and `uniq_one_subject_per_game` on `players(game_id)` where role is `host` / `subject`, and make `games.host_player_id` NOT NULL
- [x] Migrate the existing 10 seed questions into a default question package, e.g. "Get to Know Me", category "General", via `package_questions`
- [x] Seed a test package in Supabase for testing, see Task 1.6
- **Blockers**: User review of this change
- **Enables**: Tasks 3.1, 3.2
- **Testability**: `select count(*) from question_packages` returns 2, `select count(*) from package_questions where question_package_id = <default package>` returns 10
- **Status**: Done, applied Nov 7 via the Management API. Verified: 7 tables, `games` has `question_package_id`, unique host/subject indexes present. Note: the first seed used `row_number() over (order by created_at)` for the default package, which scrambled the order because all 10 timestamps tie. Fixed by re-seeding with explicit order, and the seed file was corrected the same way.

### Task 1.6: Test Question Package (seeded in Supabase, per user Nov 7)

- [x] Insert a test package "Test Package", category "Test", with 5 test questions, in `supabase/seed_packages.sql`
- [x] Apply to Supabase via the Management API, verify with a count query
- **Blockers**: Task 1.5
- **Testability**: `select count(*) from package_questions where question_package_id = <test package>` returns 5
- **Status**: Done, verified Nov 7: "Get to Know Me" 10 questions in original order, "Test Package" 5 questions, the 5th reusing the season question from the default package

### Task 1.3: Seed Questions

- [x] Write `supabase/seed.sql` with 10 generic questions, 4 options each
- [x] Seed only if the questions table is empty, so re-running is safe
- [x] Apply seed to Supabase via the Management API
- **Blockers**: Task 1.2
- **Enables**: Task 3.1
- **Testability**: `select count(*) from public.questions` returns 10
- **Status**: Done, count verified as 10. Seed will be reworked under Task 1.5 so those 10 questions belong to the default question package.

### Task 1.4: Type Definitions

- [x] Update `lib/types.ts` with QuestionPackage and Game interfaces, and add `question_package_id` to Question
- [x] Create `lib/types.ts` with TypeScript interfaces: Room, Player, Question, Answer, RoomQuestion
- **Blockers**: None, can be done in parallel with 1.1
- **Enables**: All other frontend tasks
- **Testability**: TypeScript compilation
- **Status**: Done, reworked Nov 7: QuestionPackage, Game (not Room), Player with game_id, GameQuestion, Answer with game_id, GameStatus, LocalSession + sessionKey. Room / RoomStatus / RoomQuestion kept as type aliases only.

---

## Phase 2: Game Logic - Highly Testable, Independent

### Task 2.1: Scoring

- [x] Create `lib/scoring.ts`:
  - `scoreQuestion()` - per-player points for one question, +2 subject match, +1 majority match, max 3
  - `majorityOptions()` - option indexes tied for most-chosen, including the subject
  - `totalPoints()` - running totals across questions
  - `subjectMatches()` - count of matches with the subject, for the final stat
- [ ] Unit tests: subject match, majority match, both, neither, majority tie, subject did not answer, no answers
- **Blockers**: Task 1.4, RULES.md
- **Enables**: Tasks 3.2, 3.3
- **Testability**: Unit tests with Jest, or a manual scoring table
- **Status**: Code done, tests not yet written

### Task 2.2: Game Code & Supabase Client

- [x] Create game code generator in `lib/supabase.ts`, 6 letters, no I/O/0/1
- [x] Create browser Supabase client from env vars
- **Blockers**: Task 1.1
- **Enables**: Task 3.1
- **Testability**: Manual, create a game and check the code format
- **Status**: Done, reworked Nov 7: `generateGameCode`, with `generateRoomCode` kept as an alias.

---

## Phase 3: Frontend - Can start after Phase 1

### Task 3.1: Home, Create & Join

- [x] `app/page.tsx` - Home: start a game (host name + pick a question package) or join a game (code + name, as Guest)
- [x] Start a game: insert game with `question_package_id` and `host_player_id`, insert host player with role `host`, save session in localStorage, return code
- [x] Join a game: look up game by code, insert player with role `guest` only. No join-as-host or join-as-subject. Show the package's name and category in the lobby.
- [x] Session restore: on `/game/<CODE>` load, read `doyouknowme:session:<CODE>` from localStorage. If the stored player row still exists, restore it with no new row. If not, clear it and join as guest.
- [x] Lobby subject picker: host only, host taps "Make subject" on a guest. Check caller is `games.host_player_id`, demote old subject to guest, promote chosen guest, set `games.subject_player_id`. Block Start Game until a subject is picked.
- **Blockers**: Tasks 1.2, 1.5, 2.2
- **Enables**: Task 3.2
- **Testability**: Manual, create and join in two browsers
- **Status**: Done, reworked Nov 7, build passed, live test not yet done

### Task 3.2: Game, Question & Results

- [x] `app/game/[code]/page.tsx` - Lobby, question, results, final leaderboard
- [x] Lobby: player list with roles, host sees Start Game
- [x] Start Game: copy the game's package questions to game_questions in `order_index` order, set status to `question`. No fixed count, no random pick, defined order only.
- [x] Question stage: question and 4 answers, everyone except host picks, including the subject
- [x] After submitting, a player goes to a waiting screen ("Answer locked in"), with no back button and no way to change the answer
- [x] Host cannot see any player's chosen answer, including the subject's, until Results — question stage shows only a submitted count, no per-player answered names
- [x] Results stage: per-answer counts, subject pick, majority pick, points this round, running totals
- [x] Results stage shows non-submitters as "did not answer — 0 pts, no vote"
- [x] Auto-advance to Results when all non-host players have submitted
- [x] Host override: Question to Results at any time
- [x] Host Next Question: back to Question, or to Final after the last question
- [x] Realtime subscriptions for games, players, answers, game_questions
- **Blockers**: Tasks 2.1, 3.1
- **Enables**: Task 3.3
- **Testability**: Manual, two browsers, one host and one guest, play one full question
- **Status**: Done, reworked Nov 7, build passed, live test not yet done

### Task 3.3: Final Leaderboard

- [x] Final stage: leaderboard by total points, plus most matches with the subject
- [x] Most-matches stat lists all tied guests, not just the first
- **Blockers**: Task 3.2
- **Testability**: Manual, play all questions in a test game to Final
- **Status**: Done, reworked Nov 7, build passed, live test not yet done. Final works for any game length.

---

## Phase 4: Deploy & Verify - Do only after user review

### Task 4.1: Vercel Env Vars

- [x] Set `NEXT_PUBLIC_SUPABASE_URL` on the doyouknowme Vercel project, Production and Preview
- [x] Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the doyouknowme Vercel project, Production and Preview
- [ ] Do not use the service role key in the browser app
- **Blockers**: None
- **Testability**: Vercel project env list shows both keys, values hidden
- **Status**: Done Nov 7. URL set via Vercel MCP, anon key set via a script that fetched it from Supabase and passed it to Vercel without printing it.

### Task 4.2: Deploy & Live Test

- [x] Push the Nov 7 rework (packages/games, waiting screen, subject picker) to `scachyshunuku/doyouknowme`, main — commit `c19dddf5`
- [x] Redeploy on Vercel after env vars are set. Note: the first deployment of `c19dddf5` failed with `STATIC_BUILD_NO_OUT_DIR` because the Vercel project framework was `null` (created before any code existed). Fixed by setting the project framework to `nextjs` via update_project, then redeploying (commit `9eaa94ae`, deployment READY).
- [x] Live test: game TKE7A2, host + subject, all 5 Test Package questions played to Final — waiting screen, host-cannot-see-answer, auto/override Results, final leaderboard all worked.
- [x] Live test 2: game BXXKT6, host + subject + guest. Q1 subject Blue, guest Blue: guest +3 (+2 subject, +1 majority), subject 0. Q2 subject Cat, guest Dog (1–1 tie): guest +1 — tied options both count as majority under the current scoring rule.
- [x] Live test 3: game UWBV5A, host + subject + 2 guessers. Q1 subject Blue, Guest1 Blue, Guest2 Red: Guest1 +3, Guest2 0. Q2 subject Cat, both guests Dog: each guest +1 (majority, no subject match). Q3 subject Beach, Guest1 Mountains, Guest2 City (1–1–1 tie): each guest +1. Totals after Q3: Guest1 5, Guest2 2, subject 0, host 0. All expected values matched.

---

## Phase 5: TV Host View, Templates, Playground (Nov 7, per user feedback)

### Task 5.1: Question templates

- [x] `lib/template.ts` — `renderQuestionText(text, {subject, host})`, supports `{subject}` and `{host}`, unknown variables left as-is, unpicked subject renders as "the subject"
- [x] Game page renders question text through the template in Question and Results stages
- [x] `supabase/seed.sql` + `supabase/seed_packages.sql` rewritten to use `{subject}`; migration `0003_template_questions.sql` applied to the live DB (all 14 questions verified templated)
- **Status**: Done Nov 7

### Task 5.2: Host TV view + mobile guest view + running leaderboard

- [x] Host renders `main.tv`: wide layout, big question text, 4 options as a read-only list (host cannot select), running leaderboard as a side panel
- [x] Guests/subject render `main.mobile`: narrow, big tap targets
- [x] Running leaderboard shows non-host players by total points, with subject matches, during question/results/final (side on wide screens, stacked on phones)
- **Status**: Done Nov 7

### Task 5.3: Results sorting + subject star

- [x] Results options sorted most answers first (ties keep original order); subject's pick starred (★) and highlighted
- **Status**: Done Nov 7

### Task 5.4: Design playground

- [x] `app/playground/page.tsx` — mock, no Supabase: view switcher (lobby, host TV, guest phone, subject phone, results, final), frame toggle (TV/computer vs phone), editable subject name, question picker, guest tap-to-answer with waiting screen. Reuses real scoring + template helpers. Linked from the home page.
- **Status**: Done Nov 7, live test pending
- [x] Check the scoring edge cases in RULES.md, especially majority tie and subject did not answer — tie rule confirmed by William Nov 7: a tie gets +1, i.e. every tied top option counts as majority.
- **Blockers**: None
- **Testability**: Manual live test, with screenshots of Question, Results, and Final
- **Status**: Done Nov 7. Live-tested, tie rule confirmed, no code change needed — `lib/scoring.ts` already implements it.
