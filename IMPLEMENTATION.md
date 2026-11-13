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
- **Status**: Done Nov 7, live-tested (game F72V5T + playground pass), active-button highlight fixed after test

---

## Phase 6: Mobile-first UX pass (Nov 7, per user feedback)

Mobile-first for guests/subject, TV/laptop for the host. One token set in `app/globals.css` (`:root` vars) keeps every view consistent.

### Task 6.1: Viewport, safe areas, focus, touch targets

- [x] `app/layout.tsx` — explicit viewport (device-width, initial-scale 1, viewport-fit cover) + theme-color
- [x] Safe-area insets on main padding and the sticky action bar (notched phones, home indicator)
- [x] `:focus-visible` gold outline on buttons/links; 16px inputs (no iOS zoom on focus)
- [x] Primary touch target 52px, small buttons 44px minimum (iOS/Android guidance)
- **Status**: Done Nov 7

### Task 6.2: Progress, feedback, sharing

- [x] Progress bar + "Question X of Y" on question/results/final, game page and playground
- [x] Waiting screen shows your own pick ("You picked: Blue") as confirmation
- [x] Submitted count as a status pill with `aria-live="polite"`
- [x] "Copy invite link" button next to the game code (clipboard, with fallback)
- [x] Host's primary action (Start / Override / Next) in a sticky bottom action bar, in thumb reach
- [x] Fixed shared-`busy` bug: picking a subject no longer makes the Start button flash "Starting…" (separate `busyStart` / `busySubjectId` states)
- **Status**: Done Nov 7, live-tested (game DS73SN): copy invite → "Copied ✓", no "Starting…" flash, waiting screen shows your pick, sticky action bar, progress bar advances. Playground phone frame: no overflow, tap targets ~50px+
- **Follow-up fixes from that test** (commit 6b8a3486): optimistic pick on tap (waiting screen shows instantly, no 1–2s dead beat), "1 pt" grammar via `lib/format.ts`, tied options labelled "tied for majority" instead of "majority", host options restyled as dashed read-only tiles with a "not buttons" caption, leaderboard scores never wrap, playground progress label de-duplicated
- **Design feedback round 2** (commit 00519062): lobby — host keeps the "host" tag, subject gets a gold ★ instead of a tag, guests get no tag, all player rows equal height (`.player-row`, 56px); playground buttons now work (Make subject picks the mock subject, Start goes to the host view, Copy invite shows "Copied ✓", Next goes to Final after the last question); waiting screen shows Standings so guests see the leaderboard; host explainer paragraph deleted, "Override to Results" renamed "Reveal results"; guest/subject explainer lines deleted; Results slimmed — "Points this round" is just "+x pts" per guest, no breakdowns or subject/host text, top-voted option(s) highlighted yellow with no "majority" label (subject's pick still ★ + gold)
- **Lobby rows, second fix** (commit 7f995d46): the 56px min-height did not equalize rows — rows with a Make-subject button grew taller (44px button + margin). Button margin removed inside player rows and row height set to 72px (button + padding), so every row matches.
- **Invite-link join dialog** (this push): opening `/game/<CODE>` with no session shows a join card (enter a name, join as guest) instead of landing in the game as a spectator; the invite link carries `?join=1`, which shows "Continue as X / Join as someone else" when already in the game. Plain refreshes resume silently. Lobby copy follows state (guests see "Waiting for the host to start…" once a subject is picked). Removed the "Package · Subject · You" subheading and the "Pick a subject first" hint. Lobby centering fix (commit 5019acb7): two-column grid only when the leaderboard aside is present; "host" pill vertically centred via `.player-name`.
- **Points hidden until Results + no Players card in-game + subject off leaderboards** (this push): running totals exclude the current question while it is being answered, so no one's points move when someone submits; auto-advance to Results on full submission can now be triggered by any connected client (was host-only, so a stale host connection could stall it); the Players card shows in the lobby only (the leaderboard is the roster once the game starts); the subject is removed from the running leaderboard, both final tables, and the waiting-screen standings; the finished screen has no side leaderboard; the second final table is now "Matches with {subject}" with the subject's name inserted.
- **Final leaderboard, two tables** (this push): the Final screen now shows two real tables — "Final leaderboard" ranked by points (rank, player, points, matches) and "Most matches with the subject" ranked by subject matches (rank, player, matches, points, ties broken by points). Replaces the single list plus the "X matched the subject N times" sentence. Same in the playground.
- **Lobby centering + host tag** (commit pending): the lobby looked left-aligned because the two-column grid reserved a 320px leaderboard column even though the lobby has no leaderboard — the grid now only applies when the aside is present (`.with-leaderboard`). The "host" pill was sitting on the name's baseline; the name span is now `inline-flex` with centered alignment (`.player-name`).
- [x] Check the scoring edge cases in RULES.md, especially majority tie and subject did not answer — tie rule confirmed by William Nov 7: a tie gets +1, i.e. every tied top option counts as majority.
- **Blockers**: None
- **Testability**: Manual live test, with screenshots of Question, Results, and Final
- **Status**: Done Nov 7. Live-tested, tie rule confirmed, no code change needed — `lib/scoring.ts` already implements it.

### Task 6.3: "Subject" renamed "Star" + home/join copy stripped (Nov 8, evening)

- [x] The word players see is now **Star**, not "subject": home intro, Host/Join panels, lobby ("Make star" button, "Waiting for the host to pick a star…"), Results ("— name's pick"), "Matches with {name}". The database role value, the `{subject}` template variable in seeded questions, and code identifiers (`subjectPlayer`, `subjectMatches`, …) stay as-is — display only.
- [x] Home: the tab and panel are now **Host a game** (was "Start a game (you are the host)"); the "You pick the subject in the lobby…" paragraph is gone from the host panel.
- [x] Join: the "You join as a guest. The host picks one guest to be the subject in the lobby." line is gone from both the home Join panel and the game-page join card.
- [x] Game-page join card no longer shows the package — just "N players in the lobby." (the now-unused `gamePackage` state/fetch was removed). Same in the playground lobby meta line ("Star: Alex · You: Sam (host)").
- [x] How it works, simplified: Results line drops "Subject scores 0" (star/host scoring 0 is a rule, not intro copy); the last step is now "The game ends after all questions are answered. Highest scorer wins." instead of describing the host hitting Next.
- [x] Host lobby: the "Julie is the star — hit Start when everyone's here." line is gone — the lobby card is just the heading and the Start button.
- [x] RULES.md renamed throughout (display word only; `{subject}` template variable documented as inserting the star's name).
- **Status**: Done Nov 8, pending deploy verification

### Task 6.4: Host TV layout + waiting-screen cleanup (Nov 8, evening)

- [x] Host TV view is now almost full width: `main.tv` max-width 1180px → 1680px, so the question panel takes the extra room.
- [x] Letter chips (A/B/C/D) are now fixed 34px squares, flex-centred, so the letter sits dead-centre in the purple chip (was `inline-block` with padding, which sat off-centre).
- [x] Leaderboard now spans the same vertical height as the question panel on wide screens: grid `align-items: stretch`, `.game-main` is a flex column with the card filling it, leaderboard aside margin removed so tops and bottoms align.
- [x] "← Leave game" link deleted from the game page.
- [x] Waiting screen no longer shows Standings — the leaderboard beside/below already shows them (game page and playground; RULES.md updated).
- [x] Card headings no longer double their top gap: `.card > h2:first-child { margin-top: 0 }` — matches the leaderboard heading, which already had no top margin on wide screens.
- **Status**: Done Nov 8, pending deploy verification

### Task 6.5: Session deleted on join + auto-advance stall (Nov 8, evening, bug)

- [x] **Found by live repro**: right after joining, `localStorage` had NO session. Root cause — the stale-session cleanup effect ran the moment `myPlayerId` was set by joining, while `players` still held the pre-join list, so "player not found" deleted the session just saved. A guest who then reloaded landed on the join card instead of back in the game.
- [x] **Fix**: the cleanup now waits for `sessionVerifiedRef` — set true only when a `load()` finishes after the session was set, reset to false when a new session is set (join). The decision is only made against a fresh player list.
- [x] **Auto-advance hardening**: the Question → Results update was fire-and-forget with the "already tried" guard set before the call, so one failed attempt stalled the question forever. The guard now clears on error, so the next load retries. Verified against the live game G7AZQ6 data: all 3 non-host players had answered Q1, RLS is "anon all" on games/players/answers, all tables are in the Realtime publication, exactly 4 players (no duplicate rows) — the stall was not a data problem.
- [x] Repro script `video-test/repro-autoadvance.js` (3 Playwright contexts via the forwarding proxy on 127.0.0.1:18080; Realtime does not push through that proxy, so pages reload explicitly — same pattern as `record.js`).
- **Status**: Done Nov 8, pending deploy verification via the repro

### Task 6.6: Name cap 25 chars + leaderboard one line (Nov 8, evening)

- [x] Names cap at 25 characters: `maxLength={25}` on the name inputs (home Host/Join, game-page join card, playground star-name input) and `slice(0, 25)` in the create/join handlers, so a saved name can never exceed the cap.
- [x] Running leaderboard rows: the name span now truncates with … (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0`) instead of wrapping, so "x pts · x matches" stays vertically aligned for every row. The score span was already nowrap + no-shrink.
- [x] Final tables: `table-layout: fixed` with rank 36px and num columns 80px, name cells (`td.name`) truncate with … — a long name can no longer stretch the table or wrap.
- **Status**: Done Nov 8, NOT YET PUSHED — held until the 61c0c99d deploy state is known (see 6.5 note)

### Task 6.7: Shuffle the 4 options per game (Nov 8, evening)

- [x] New `lib/shuffle.ts`: `seededShuffle` (FNV-1a hash -> mulberry32 -> Fisher-Yates) + `shuffledOptions(options, gameId, questionId)`. The order is deterministic per game+question: every player sees the same order, it survives reloads, and a new game gets a new order. Shuffling on every render would break the game — answers are stored as positions in the shown order, so the host TV, guest phones, and Results must all agree on one order for the whole question.
- [x] Game page: `displayOptions` derived from the current question; host tiles, guest buttons, "You picked", and the Results option rows all read it. Playground: same helper with a fixed "playground" game id (stable mock order). Checked the shuffled Q2 order — Dog stays at index 0, Cat at 1 — so the deliberate Q2 mock fixture (guests agree on Dog, star picks Cat) is unchanged; the other questions' index-based mock picks keep their top == star's pick story under any order.
- [x] RULES.md updated with the shuffle rule.
- **Status**: Done Nov 8, NOT YET PUSHED — held with Task 6.6 until the 61c0c99d deploy state is known (see 6.5 note)

### Task 6.8: Results "your pick" + Answer review on the final screen (Nov 8, evening)

- [x] Results screen: the option the viewing player picked is now marked "— your pick" next to the star's "— {name}'s pick" (same subtext pattern; the host sees no marker since they never pick). Mirrored in the playground using its mock `guestPicked`.
- [x] Final screen: new "Answer review" card below the two tables. One block per question in played order: the star's pick first (★), then each guest's pick with the points it earned that round, your own line marked "(you)", a ✓ when a pick matched the star, and "did not answer" for anyone who skipped. Picks read through the same per-game shuffled option order, so the text matches what each player saw. Mirrored in the playground with mock picks (no "(you)" marker there — the playground has no single viewer).
- [x] RULES.md updated (Results list + Final Leaderboard section).
- **Status**: Done Nov 8, NOT YET PUSHED — held with Tasks 6.6/6.7 until the 61c0c99d deploy state is known (see 6.5 note)

### Task 7: Custom questions at join + host Skip (Nov 8, evening)

- [x] Migration `supabase/migrations/0004_skip_question.sql`: `game_questions.skipped boolean not null default false`. Applied live Nov 8 and verified (column present). RLS "anon all" already covers `questions` and `game_questions`, so browser inserts/updates work — verified live with a throwaway game (`video-test/verify-custom.mjs`, cleaned up after).
- [x] Custom questions (`lib/custom-questions.ts`, `components/CustomQuestionForm.tsx`): the join form (home Join tab and game-page join card) has a collapsed "+ Add your own question (optional)" section — question (max 300 chars) + 4 choices (max 150 each, raised from 140/50 in Task 15). All five fields or none; a partial fill blocks joining with an error. `{subject}` / `{host}` work in custom text. The question is saved before the player row (a failed save aborts the join, nothing half-created).
- [x] Ordering: custom rows live at `order_index >= 1000` (`CUSTOM_ORDER_START`), so they always sort after the bank (0..N-1) and never collide with the package copy at Start. At Start the host shuffles the customs into a random order after the bank (two-phase slot swap — park on 10000+ first — because (game_id, order_index) is the primary key). Their options shuffle per game like every other question. A custom added mid-game lands last, unshuffled.
- [x] `startGame` rework: it no longer gates the package copy on "no questions yet" (guests may have added customs before Start, which would have skipped the bank copy entirely). It now inserts only the package questions not already present, then shuffles customs, then starts.
- [x] Host Skip (`skipQuestion`): a "Skip question" button next to "Reveal results" on the host's question view. Marks the row `skipped: true`; `load()` filters skipped rows out, so the list shrinks by one and the next question slides into the slot (index stays put) — if it was the last question, the game finishes. No points are scored, it never reaches Results, and it does not appear in the Answer review. Mirrored in the playground (`skippedIds` state; totals and review exclude skipped questions).
- [x] Action bar is now a flex row (two buttons sit side by side; single-button bars are unchanged).
- **Status**: Pushed Nov 8 as commit ef270cf (first attempt timed out on approval; retry approved). Verified LIVE Nov 8 ~23:00 (live chunk page-8d8673c87dc7e747.js, 22,856 bytes, contains "Answer review" and "Skip question", no "Leave game")

### Task 8: Feedback round — select arrow, custom form, lobby count, leaderboard columns, result padding, skip keeps count, review grid (Nov 8, late evening)

- [x] Home package select: `select { padding-right: 40px; }` so the dropdown arrow is never clipped.
- [x] Custom-question form is no longer a toggle button: the question + 4 choices are always visible under the join form, labelled "Your own question (optional)". No remove button, no "plays after the question bank" blurb. Blank question = just join; filled question = all 4 choices required (unchanged validation).
- [x] `{star}` is now a template variable (`lib/template.ts` replaces `{star}` and `{subject}` with the star's name). The custom-question placeholder reads "What is {star}'s favourite food?". Seeded questions still use `{subject}` and still work. RULES.md leads with `{star}`.
- [x] Lobby heading is now just "Players" (the "(N)" count is gone).
- [x] Running leaderboard score is now two fixed right-aligned columns (pts 60px, matches 92px) with the "·" between them, so points and matches line up for every row. Applied to the game page and both playground asides. Final tables already had separate columns.
- [x] Results rows: every `.result-option` now has side padding (10px 14px; top-pick 8px 12px) and the top-pick lost its negative horizontal margin, so the gold border no longer bleeds to the card edge.
- [x] Progress gap: `.progress-label` has 16px bottom margin, so the panels no longer sit tight under "Question x of y".
- [x] Skip keeps the count: `load()` no longer filters skipped rows out of `questions` — a new `skippedIds` set tracks them, `countedQuestionIds` excludes them (so they score 0), and `skipQuestion` now advances like Next Question (index+1 or finished). The total never drops. The Answer review includes skipped questions marked "— Skipped" with +0 pts and no ✓. Mirrored in the playground (review includes skipped questions; totals already excluded them).
- [x] Answer review rows are now a grid: name column (150px, right-aligned, ellipsis), answer left-aligned, points right-aligned; the star sits right of the name ("Julie ★"). The review question line is 18px on all screens (below the 20px/26px "Answer review" heading), overriding the 40px TV question size.
- [x] Verified: `npm run build` passes. Playground screenshots checked locally (review grid, result padding, leaderboard columns). The home select and a live skip play-through need the deployed build to verify.
- **Status**: Pushed Nov 8 as commit 326b34de (first attempt approved). Verified LIVE Nov 8 ~23:49 (home chunk page-1cc383b26589180b.js contains "Your own question (optional)"; game chunk page-ed58b2be7a2ec6e0.js, 23,155 bytes, contains "Skipped" and "review-row")

### Task 9: Custom-question limit, no-package games, replay (Nov 8, late evening)

- [x] Migration `supabase/migrations/0005_custom_limit.sql`: `games.custom_question_limit integer not null default 1 check (custom_question_limit between 0 and 5)`. `question_package_id` was already nullable (0002), so no change needed for no-package games. `Game` type gains `custom_question_limit`.
- [x] Create screen: a "Custom questions only" checkbox (the package dropdown is disabled while it is on) plus a "Custom questions per guest" select (0–5, default 1). Creating with no package and limit 0 is rejected ("Pick a question package, or allow at least 1 custom question per guest."). The insert stores the limit.
- [x] Join forms (home Join tab + in-game join card) render one question block per allowed question (labelled "Your own question N (optional)" when the limit is above 1), hidden entirely when the limit is 0. The home tab looks the limit up from the game once the 6-char code is entered. `insertCustomQuestions` saves each complete block in order (empty slots skipped, a partial slot blocks the join naming the question).
- [x] `startGame` no longer requires a package: the bank copy runs only when a package was picked, and a no-package game cannot start until at least one custom question exists (lobby Start button is disabled and shows the reason; `startGame` guards it too). The lobby shows how many custom questions have been added.
- [x] Replay: on the final screen the host gets a "Play again" button. It returns the game to the lobby with the same code and players, demotes the star back to guest, clears the star, deletes all answers, and un-skips every question. The questions stay (bank in defined order, customs re-shuffled at the next Start). Mirrored in the playground (final view resets to lobby, star cleared, skips cleared).
- [x] RULES.md updated (limit, no-package, replay).
- [x] Verified: `npm run build` passes. Migration 0005 applied live Nov 8 (column default 1; limit 6 rejected by the check constraint; null-package game with limit 0 inserts fine). Replay steps verified on a throwaway game (lobby/index 0/star cleared, 0 answers left, 0 skipped, 2 customs kept, star demoted to guest) and cleaned up. Playground final view screenshotted (Play again button). Live play-through (no-package game, multi-question join, replay) needs the deployed build.
- **Status**: Pushed Nov 9 as commit 35654b82 (with Task 10). Verified LIVE Nov 9 ~00:19 (game chunk page-033cd0f86307b628.js contains "Game setup", "Add your questions", "Start now", "contributing", "No questions were added"; home chunk has no join-form custom-question text). Parts superseded by Task 10: the join-form custom questions and the create-screen limit/checkbox moved to the lobby + contribution phase; replay now clears the questions instead of keeping them.

### Task 10: Questions in the lobby + contribution phase after Start (Nov 8, late evening)

- [x] Migration `supabase/migrations/0006_contribution_phase.sql`: new game status `contributing` (widened the `rooms_status_check` constraint), `games.custom_questions_required boolean not null default false`, `players.contribution_done boolean not null default false`. Types updated (`GameStatus` gains `contributing`; `Game.custom_questions_required`; `Player.contribution_done`).
- [x] Create screen is back to name + package only (the custom-only checkbox and limit select moved out); the join form is back to code + name only (no question form at join any more). The Task 9 multi-question join helpers (`insertCustomQuestions`, `withCustomQuestionCount`) are removed as unused.
- [x] Lobby Game setup card (host only): package select (changeable, writes to the game row), "Custom questions only" checkbox (disables the package select; sets the package to null, restores the last package on uncheck), "Custom questions per guest" number input (0–5, default 1; typed value commits clamped on blur/Enter, empty or invalid reverts), "Require each guest to add their questions" checkbox (disabled when the limit is 0). Questions can be optional for a custom-only game — but the game needs at least one: if nobody adds one, the adding step ends back in the lobby with an error, and Start resets everyone's done flags so it can be tried again. Start is blocked when the setup would yield no questions (no package and limit 0).
- [x] Start: copies the bank (if a package), then goes to the first question when the limit is 0, or into the new `contributing` status otherwise. The custom shuffle moved out of Start into the phase finish.
- [x] Contribution phase: every non-host player (guests and the star) fills their slots one at a time — a question with 4 choices, then "Next question" (or "Complete" on the last slot); "Skip" appears only when questions are optional. A slot must be complete to save. The wizard position survives a reload (localStorage per game). When everyone is done the game starts on its own (any client can trigger the finish, guarded by a status re-check); the host's waiting screen lists who is done and has a "Start now — skip remaining questions" override so one stalled player cannot soft-lock the game.
- [x] Replay reworked: Play again deletes all `game_questions` rows and all answers, demotes the star, clears the star, resets every `contribution_done` flag, and returns to the lobby. The setup stays so the host can change it before starting again.
- [x] Playground: new "Add questions" view — a mock wizard (2 slots, Next/Complete/Skip, done state) plus the host's waiting view.
- [x] RULES.md updated (contribution phase, lobby setup, replay).
- [x] Verified: `npm run build` passes (after fixing the playground mock players for the new `contribution_done` field). Migration 0006 applied live; DB layer verified on throwaway game TST9B1 (status `contributing` inserts, replay steps leave 0 game_questions / 0 answers / 0 done flags, cleaned up). Playground mock wizard verified by screenshot + clicks (Next → slot 2, Complete → "✓ You're done"). A full live play-through (lobby setup → contribution phase → first question → replay) needs the deployed build.
- **Status**: Pushed Nov 9 as commit 35654b82 (with Task 9). Verified LIVE Nov 9 ~00:19 (game chunk page-033cd0f86307b628.js, 30,368 bytes, contains "Game setup", "Add your questions", "Start now", "contributing", "No questions were added"; home chunk page-3b30b71bf3066d98.js has no join-form custom-question text).

### Task 11: Review fixes — replay as a new game, server-side shuffle, security cheap wins, limit 10, code design (Nov 9, early morning)

Four parallel reviews (security, code design, bug hunting, UI) ran on the 35654b82 push; William directed the fixes.

- [x] **Replay is a new game.** `playAgain` (host only, final screen) creates a brand-new game row (new code, same setup — package, limit, required — same host) with a new host player row, saves the host's session for the new code and navigates to it. Guests re-join with the new code like any game; the old game stays finished as history. This retires the same-row reset and with it the auto-advance-guard and wizard-position staleness (B1, B6).
- [x] **Late answers (B3).** `submitAnswer` re-reads the game row immediately before inserting and aborts unless status is `question` and the question id matches `questions[current_question_index].id` ("That question is already over.").
- [x] **Start uses the lobby's local state (B4).** The setup card is local-state-driven (`setupPackageId` / `setupLimit` / `setupRequired`, initialized from the game row once, updated synchronously on every change and persisted via `updateGame`). `startGame` reads the local state for validation + the bank copy and commits the setup with the status change, so a just-changed package or limit can never be lost to a stale closure. `busyStart` also guards double-invocation.
- [x] **Phase-open check (B5).** `submitContribSlot` re-reads the game status before inserting; if the phase is over it drops the draft and shows "The host already started the game."
- [x] **Skip busy flag (B8).** `skipContribSlot` sets `contribBusy` (and returns early if already busy), so a double-click cannot skip two slots.
- [x] **Shuffle rework (server-side).** Migration `supabase/migrations/0007_finish_contribution.sql`: `finish_contribution(p_game_id uuid)` (SECURITY DEFINER, `grant execute … to anon`) locks the game row (`select … for update`), returns false unless status is `contributing`, returns to the lobby when there are no questions at all, otherwise shuffles the custom questions once after the bank (park at 20000+, assign consecutive slots from 1000 in random order) and starts the first question — all in one transaction. The client calls `sb.rpc("finish_contribution", …)` and `shuffleCustomQuestions` is deleted. The 4 answer choices were already shuffled once per game (deterministic seed, `lib/shuffle.ts`) — only the question-order shuffle needed this fix.
- [x] **Copy bugs.** The wizard error is conditional on the required flag ("Fill in the question and all 4 choices." / "…, or Skip it."); "Question N of M" is printed once (the form label only — the intro line carries just the qualifier and renders nothing when there is none).
- [x] **Security cheap wins.** Migration `supabase/migrations/0008_content_limits.sql`: DB CHECKs — `players.name` ≤ 25, `questions.text` ≤ 140 (raised to 300 in Task 15), options valid (exactly 4 strings ≤ 50 via the immutable `options_are_valid(jsonb)` helper, raised to 150 in Task 15), `games.code` format `^[A-Z2-9]{6}$`, `games.current_question_index >= 0`; the per-guest limit range widens to 0–10. Existing data was checked first (max name 11, max question 44, max option 19, 0 bad codes, 0 bad option arrays). `next.config.ts` gains security headers (X-Frame-Options DENY, Referrer-Policy no-referrer, CSP allowing self + Supabase). Not in this batch (deferred): the token/API-layer rework, rate limits, per-game player cap.
- [x] **Limit 0–10, dropdown again.** The per-guest limit is a `<select>` (0–10, "0 — no custom questions") in the lobby setup card; the number input + `commitLimit` clamp-5 machinery is gone. The DB check is 0–10 (migration 0008). RULES.md "0–5" → "0–10".
- [x] **Package loading (UI #4).** The game-page setup select shows "Loading packages…" until the package list arrives, then "No question packages found" when empty (mirrors the home page). The loader is now the shared `lib/packages.ts` `loadPackagesWithCounts` (used by both pages; the two queries run in parallel).
- [x] **"Start now".** The host force-start button is labelled just "Start now".
- [x] **Dim the row (UI #5).** `.checkbox-row:has(input:disabled) { opacity: 0.5; cursor: default; }` dims the disabled "Require…" row; setting the limit to 0 also clears `custom_questions_required` (so the flag cannot go stale).
- [x] **"Adding…" (UI #7).** Pending players on the host's waiting screen show "Adding…" in muted text instead of "…".
- [x] **Lobby line (UI #10).** The lobby card tells everyone, before the game starts: "Guests add N question(s) each (required) before the game starts." (only when the limit is above 0).
- [x] **Drop the choice placeholders (UI #9).** The 4 choice inputs in `CustomQuestionForm` have no placeholder (the label already says which choice it is); the question input keeps its example placeholder.
- [x] **Ghost players (B2).** "Join as someone else" (`switchPlayer`) deletes the old player row first (its answers cascade), so no ghost blocks auto-advance. The home `joinGame` restores an existing session for a code instead of inserting a duplicate row.
- [x] **Author column (design #3).** Migration 0008 adds `game_questions.created_by_player_id` (FK to players, on delete set null). `insertCustomQuestion` records the author; `submitContribSlot` counts the player's own customs and refuses another past the limit. (The wizard slot still lives in localStorage — a skipped slot has no row to count.)
- [x] **Code design.** The game page was an 858-line god component; it is now a thin shell (`app/game/[code]/page.tsx`, ~50 lines) over `lib/use-game.ts` (state, live updates, derived values, all actions) with one component per stage under `components/game/` (JoinCard, LobbyCards, ContributeCard, QuestionCard, ResultsCard, FinalCard, RunningLeaderboard), each taking the whole game state. Shared helpers: `lib/packages.ts`, `lib/leaderboard.ts` (leaderboard filters/sorts — the game page and playground use the same ones). `load()` fetches the three game-scoped reads in parallel. Status guards (`.eq("status", …)`) on `showResults` / `nextQuestion` / `skipQuestion`. `finishMyContribution` checks its write. `finishContribution` is a `useCallback`; all four `eslint-disable` comments are gone (deps made honest). Dead code deleted: `Room` / `RoomStatus` / `RoomQuestion` / `LocalSession` types, `generateRoomCode`, `isCustomQuestionEmpty`, the `games.subject_name` write (never read), the always-false points tag in the lobby Players card. `GameQuestion` gains `skipped`. `generateGameCode` uses `crypto.getRandomValues`. `createGame` retries a code collision and deletes the orphan game row on a failed player insert. Stale comments fixed (`Game.custom_question_limit`, `CustomQuestionForm` header, `lib/custom-questions.ts` header). ARCHITECTURE.md updated (Layer 2, playground, RPC).
- [x] **Playground (design #12).** Uses the real `CustomQuestionForm` (with `contribQ` state), a mock Game setup card in the lobby (package select, custom-only checkbox, limit dropdown 0–10, require checkbox, the guest line), the shared leaderboard helpers, "Start now" and "Adding…" copy, and Play again resets the contrib mock state (slot, done, draft).
- [x] RULES.md updated (limit 0–10, replay as a new game, server-side shuffle).
- [x] Verified: `npm run build` passes. Migrations 0007 + 0008 applied live and verified on throwaway games (RPC: first call true + status `question` + customs shuffled + bank at 0, second call false, empty game false + back to lobby; CHECKs: 26-char name rejected, 2-option question rejected, limit 11 rejected, limit 10 accepted; test games cleaned up). Playground screenshots pending. A full live play-through (lobby setup → contribution phase → first question → Play again to a new game) needs the deployed build.
- **Status**: PUSHED Nov 9 ~08:48 as commit `49a3cbc` and VERIFIED LIVE (game chunk page-1916286348c79836.js contains "Start now", "Adding…", "Game setup", "contributing", "finish_contribution", "Play again"). Migrations 0007 + 0008 were already live. Follow-up fix pushed Nov 9 ~08:53 as commit `56b29c0` and VERIFIED LIVE (new chunk page-6f078d17ab0953ca.js; live CSS `.action-bar{margin-top:16px;display:flex;gap:10px}` — no sticky): the sticky action bar is gone (it covered inputs while scrolling; it now sits below the content in normal flow), and the limit-0 dropdown label was fixed to "0 — no custom questions" (the real LobbyCards had it truncated to "0 — no custom ").

### Task 12: Drop the package category (Nov 9, morning)

William: "Question package doesn't need category."

- [x] Migration `supabase/migrations/0009_drop_package_category.sql`: `alter table public.question_packages drop column if exists category;` — applied live and verified (question_packages now has id, name, created_at only). The live rows lose only their "General" / "Test" labels; names and questions untouched.
- [x] Code: removed `category` from `QuestionPackage` (`lib/types.ts`), `PackageWithCount` + the select + the cast (`lib/packages.ts`), the packages state type (`lib/use-game.ts`), and both package displays — home create select and the lobby setup select now read "Name (N questions)". The playground mock never used category.
- [x] `supabase/seed_packages.sql`: the two package inserts no longer pass a category, so the seed stays runnable.
- [x] Docs: RULES.md, ARCHITECTURE.md, AGENTS.md no longer say "category optional" — a package is a named list of questions, name required.
- [x] Verified: `npm run build` passes.
- **Status**: PUSHED Nov 9 ~09:15 as commit `2d8477d` and VERIFIED LIVE (home chunk page-263a6b5382505da7.js has 0 "category" references; migration 0009 already live).

### Task 13: Game questions are self-contained copies (Nov 9, morning)

William: "game questions should copy the whole question in so users can just add game question without adding or touching the question bank… on start the configuration is set so you can just copy over all the question package questions in shuffle it and then any user's contribution can come afterwards… mark them as a custom question and then when they're all done you can shuffle those as well."

- [x] Migration `supabase/migrations/0010_game_questions_self_contained.sql` — applied live and verified. `game_questions` gains `id` (uuid PK, the per-game question identity), `text`, `options`, `is_custom`, and drops `question_id`; `answers` gains `game_question_id` (FK → game_questions, cascade) and drops `question_id`. Backfills verified: all 63 game_questions rows got text/options (1 marked is_custom from the old order_index ≥ 1000), all 75 answers got game_question_id, 0 orphans. New CHECKs: text ≤ 140, options valid (exactly 4 strings ≤ 50) — raised to 300/150 in Task 15. `finish_contribution` rewritten for the new shape (shuffles is_custom rows by id, placing them right after the bank — consecutive slots from the bank count; verified on a throwaway game TSTR23: first call true + status `question`, bank at 0–1, customs at 2–3, second call false; test game cleaned up).
- [x] Client: `load()` reads game_questions only (no join to the questions bank); `startGame` copies the package's questions into game_questions as full rows (text + options, is_custom false) and shuffles them once (`shuffleArray`, lib/shuffle.ts), only when the game has no questions yet; customs insert directly into game_questions (no questions-table row) at the next slot after the bank, marked is_custom, author recorded; the per-guest limit counts the player's own customs. `submitAnswer` / `skipQuestion` / scoring / FinalCard / playground all use `game_question_id` and the game-question id. `CUSTOM_ORDER_START` (1000) is gone.
- [x] Types: `GameQuestion` is now the played question (id, game_id, text, options, order_index, is_custom, skipped, created_by_player_id); `Question` stays as the bank row type (only startGame reads the bank, for the copy); `Answer.game_question_id` replaces `question_id`.
- [x] Docs: RULES.md / ARCHITECTURE.md updated (bank shuffled at Start, customs shuffled when the contribution phase ends — this supersedes the old "defined order, no shuffle" rule; AGENTS.md's "no shuffle in v1" line updated too).
- [x] Verified: `npm run build` passes. Migration + RPC verified live (above).
- **Status**: PUSHED Nov 9 ~09:25 as commit `86cdc3cb` and VERIFIED LIVE (game chunk page-53e899603b3ac204.js contains "game_question_id", "is_custom", "finish_contribution"). Full live play-through VERIFIED Nov 9 ~09:30 on game FMYYDF: host created a Quick Test game, GuestB added a custom question in the wizard ("What is {star}'s favourite test snack?"), GuestA skipped, the game auto-started at "Question 1 of 4", both guests answered Q1 and the host auto-advanced to Results. DB verified: 4 game_questions rows (bank shuffled — ideal test day, colour, animal — at 0–2, custom at 3 with is_custom true + author), the questions bank still at 15 rows (custom never touched it), both answers carry game_question_id. Test games FMYYDF + 8RQUTP cleaned up.

### Task 14: No joining as someone else — player rows are never deleted (Nov 9, morning)

William: "can we make it such that we can't switchPlayer so you can't join as someone else? I dont want deleting players."

- [x] `switchPlayer` deleted from `lib/use-game.ts` (interface, function, returned state) and the "Join as someone else" button removed from `components/game/JoinCard.tsx`. Opening your own invite link while already in the game now offers only "Continue as X". No code path deletes a player row anymore, so a game cannot lose its host or its star (and their answers) to a switch.
- [x] Docs: RULES.md now says there is no joining as someone else and a player row is never deleted.
- [x] Verified: `npm run build` passes.
- **Status**: PUSHED Nov 9 ~09:27 as commit `42d600b` and VERIFIED LIVE (game chunk page-a401aa9a3916f412.js has 0 "Join as someone else" and 0 "switchPlayer"; "game_question_id" and "is_custom" still present).

### Task 15: Longer questions and answers — 300 / 150 chars, with long-text UI (Nov 9, morning)

William: "Ideally I want questions and answers to go up to 300 characters each. Would that make the ui look really bad? Is there a way to improve it?" then "Let's do 150 characters for answers and do these changes." So questions 300, answers 150.

- [x] Migration `supabase/migrations/0011_raise_content_limits.sql` — applied live and verified: `questions.text` and `game_questions.text` CHECKs raised 140 → 300; the shared `options_are_valid(jsonb)` function raised 50 → 150 per option (covers both tables' options CHECKs). Verified live: a 300-char question + 150-char options insert succeeds; a 301-char question is rejected by `game_questions_text_length`, a 151-char option by `game_questions_options_valid`; test rows cleaned up.
- [x] Client caps: `lib/custom-questions.ts` `MAX_CUSTOM_QUESTION_LENGTH` 140 → 300, `MAX_CUSTOM_CHOICE_LENGTH` 50 → 150 (the custom-question form's `maxLength` attributes read these constants).
- [x] Long-text UI (the "improve it" part): a question over 150 chars gets the `long` class — 20px → 18px on phones, 40px → 28px on the host TV; any option over 100 chars puts the `long-options` class on the options container — guest buttons 18px → 16px, host tiles 24px → 18px with tighter padding, and the host's 2-column grid drops to a single column (a list reads better than a tall uneven grid). The "You picked" line shrinks the same way. Applied in `components/game/QuestionCard.tsx`, `ResultsCard.tsx`, `FinalCard.tsx`, and the playground (which mirrors the same classes).
- [x] Results + answer review: long options clamp to 3 lines with a gold "…show more" hint and expand in place on tap (`components/ExpandableText.tsx`, threshold 100 chars). The question screen never truncates — players need the full option to choose. Found during screenshot verification: the hint was first placed *inside* the clamped span, so line-clamp hid it too — the hint is now a sibling of the clamped text, outside the clamp.
- [x] Playground Q3 is now a long-text preview (a ~280-char question with ~140-char options) so the long-text UI is previewable there instead of only in a live game.
- [x] Verified: `npm run build` passes; local playground screenshots confirm the host TV view (28px question, single-column 18px tiles), the guest phone view (18px question, 16px buttons, all 4 options visible), Results (clamped rows with visible "…show more", tap expands to full text with "— show less"), and the answer review (clamped picks with hints).
- **Status**: PUSHED Nov 9 as commit `c1d2a78` and VERIFIED LIVE (game chunk page-17b0cc41a6d7be17.js contains "show more", "show less", "long-options"; live CSS contains "long-options", "expandable", "question-text.long").

### Task 16: Option text beside the A/B/C/D chip, chips on mobile too (Nov 9, evening)

William, from the screenshots: "i think the text should be on the right of the A/B/C/D icon so it doesnt go underneath it", then "the button isnt vertically centered anymore", then "can we add the ABCD chips in mobile too so they know".

- [x] Host tiles are now a flex row: the letter chip stays on the left and the option text wraps in its own column to its right, never underneath the chip (`.host-option { display: flex; gap: 12px; }`, option text wrapped in an `.opt-text` span with `flex: 1; min-width: 0`). The chip's `margin-right` moved into the flex gap. Applied in `components/game/QuestionCard.tsx` and the playground.
- [x] The chip is vertically centred in the tile again: the first pass used `align-items: flex-start` (chip stuck at the top), fixed to `align-items: center`. Same for the guest buttons and the "You picked" line.
- [x] Mobile guest buttons now have the same A/B/C/D chips as the host TV view, so guests know which option is which when the host calls one out by letter. The buttons are flex rows (chip left, vertically centred; text in its own column). The "You picked" line shows the picked option's chip too.
- [x] Verified: `npm run build` passes; local playground screenshots confirm the host TV tiles (chip centred, text beside it), the guest phone buttons (chips present, text beside them), and the "You picked" line (chip + text).
- **Status**: PUSHED Nov 9 as commit `96b8fb9` and VERIFIED LIVE (game chunk page-b129cd0c22b6109a.js contains "opt-text" and "opt-letter"; live CSS contains "opt-text").

### Task 17: Lobby — no extra margin after the last player (Nov 11, evening)

William, from a screenshot of game JH9T9V: "lobby has extra margin at the bottom of the last player. I dont think we need that."

- [x] The last player row's own bottom padding (14px) stacked on the card's bottom padding (16px), leaving ~30px of dead space after the last player. Added `.player-row:last-child { padding-bottom: 0; }` so the last row sits flush on the card's padding, matching the top (the heading sits on the same 16px). Measured in the playground lobby: gap after the last player is now 17px (16px card padding + 1px border), down from ~31px.
- [x] Verified: `npm run build` passes.
- **Status**: PUSHED Nov 11 as commit `f35fe6a` and VERIFIED LIVE (live CSS contains the "player-row:last-child" rule).

### Task 18: Game setup card redesign (Nov 11, evening)

William, from a screenshot of game JH9T9V: "Question package" -> question bank; "the dropdown arrow is clipped on the right again"; "the checkbox looks ugly and not in the theme of our colour"; "Custom only" should be "Custom questions only"; "Custom questions per guest"; "for 0, don't need to add the extra '--- no custom questions'"; "the layout overall can have a UX / design improvement". Plus: guests don't need to see "Guests add 1 question each before the game starts." — "That doesnt even get updated as the host changes the configs".

- [x] `app/globals.css`: custom select arrow — `select { appearance: none; background-image: url("data:image/svg+xml,…chevron stroke %23c9cbe0…"); background-position: right 16px center; padding-right: 48px; }` (replaces the clipped native arrow). Themed checkbox — `.checkbox-row input[type="checkbox"] { appearance: none; width: 22px; height: 22px; border: 2px solid var(--border-strong); border-radius: 6px; background: #12152a; }`, `:checked` → accent (#6c5ce7) fill + white "✓" via `::after`, `:disabled` dimmed. `.checkbox-row` is now a toggle row (padding 12px, border, radius 10px, background #12152a). New `.field` groups (20px spacing) and `.form-section` (18px, 700, #fff) for the wizard heading.
- [x] `components/game/LobbyCards.tsx`: Game setup card wrapped in `.field` groups; label "Question bank"; checkbox "Custom questions only"; label "Custom questions per guest"; limit options render plain `{i}` (0 is just "0"); the "Require each guest to add their questions" label is no longer truncated. The "Guests add N question(s) each…" line now renders only when `isHost && effectiveLimit > 0`.
- [x] `app/page.tsx` home create form: "Question package" → "Question bank". Playground setup card mirrored (fields, labels, plain "0").
- [x] Verified: `npm run build` passes; local playground screenshots confirm the chevron is visible and unclipped, the toggle rows, the themed checkbox boxes, and the new labels.
- **Status**: PUSHED Nov 11 as commit `bd9f5c5` (with Tasks 19–25) and VERIFIED LIVE (live chunk page-24cd8ac5d007dfd0.js; live CSS contains the custom select arrow and themed checkbox rules).

### Task 19: Contribution wizard — copy, expanding inputs, no {star} template for customs (Nov 11, evening)

William: "for adding questions you don't need to have 'You can skip any of them.' line"; "Can Question 1 of 1 be in a different size / style a bit bigger than the choices headings?"; "the input text boxes should have word wrap and expand rather than go on forever on one line"; "also for custom questions, since we know who the star is, we don't need the {star} header thing or even use it. We can show them as is because people will just put the actual name".

- [x] `components/game/ContributeCard.tsx`: the "You can skip any of them." paragraph is gone; now only `{!questionsRequired && customOnly && (<p>The game needs at least one question to start.</p>)}`. Playground contribute view: the line removed too. ContributeCard passes `starName={subjectPlayer?.name ?? null}` to CustomQuestionForm.
- [x] `components/CustomQuestionForm.tsx` rewritten: internal `ExpandingTextarea` (textarea rows={1}; useEffect on value sets height auto → scrollHeight); question label has `className="form-section"`; new optional prop `starName`; question placeholder is `e.g. What is ${starName}'s favourite food?` when starName is given, else "e.g. What's the star's favourite food?"; choices keep no placeholder; maxLength still 300/150 from lib constants. Playground passes `starName={subjectName || null}`.
- [x] `app/globals.css`: `textarea` styled like inputs (width 100%, padding 12px, radius 10px, border var(--border-strong), background #12152a, font-size 16px, font-family inherit, line-height 1.5, resize: none, overflow: hidden); textarea added to the focus rule.
- [x] Literal rendering for customs: `lib/use-game.ts` `questionText` = `currentQuestion.is_custom ? currentQuestion.text : renderQuestionText(...)`; `components/game/FinalCard.tsx` reviewText uses the same conditional. Bank questions still templated.
- [x] Verified: `npm run build` passes; local playground screenshots confirm the bigger "Question 1 of 2" heading and the expanding textarea (a long question wraps and the box grows).
- **Status**: PUSHED Nov 11 as commit `bd9f5c5` (with Tasks 18, 20–25) and VERIFIED LIVE (live chunk page-24cd8ac5d007dfd0.js).

### Task 20: Wizard finish flicker fix (Nov 11, evening)

William: "when you tap continue or skip on the add question dialog. It disables and enables right away with a blank question before figuring out that we are done and move to the next screen. fix that"

- [x] Root cause: `finishMyContribution` did the DB update first and only marked the player done locally afterwards, so on the last slot the wizard sat on a blank question while the round-trips landed — and the early `setContribBusy(false)` re-enabled the buttons in that window.
- [x] Fix (`lib/use-game.ts`): `finishMyContribution` now marks the player done locally FIRST (`setPlayers` + clears the form + drops the wizard position) before the DB update, so the card switches to "✓ You're done" the moment the button is tapped; the buttons stay disabled (`contribBusy`) until `load()` + `finishContribution()` finish at the very end. If the DB update fails, the next `load()` re-reads the real state, the wizard comes back, and the error is shown.
- [x] `submitContribSlot` / `skipContribSlot`: when `finishAfter` is true they no longer set contribBusy(false) after `finishMyContribution()`; the non-finish branch still advances the slot and sets busy false.
- [x] Verified: `npm run build` passes; full local play-through (`video-test/verify-replay.mjs`, game 8VR96A): after tapping Complete on the last slot the button never re-enabled on a blank wizard (checked every 200ms for 3s) for either guest, and both reached "You're done" / the question screen.
- **Status**: PUSHED Nov 11 as commit `bd9f5c5` (with Tasks 18, 19, 21–25) and VERIFIED LIVE (live chunk page-24cd8ac5d007dfd0.js).

### Task 21: Leaderboard — points only, with Rank / Name / Points headings (Nov 11, evening)

William, from a Results screenshot: "for the leaderboard, let's just show the points and let's have headings (name, points) rather than have 'pt' and 'pts'. the alignment is off if we keep that", then "oh and rank".

- [x] `components/game/RunningLeaderboard.tsx` rewritten as a table (reusing `.leaderboard-table`): headings Rank / Name / Points, rows show the rank number, the name (★ for the star), and the bare points number — no "pt"/"pts" suffix and no matches column. The Final leaderboard tables keep their Matches column (there is a separate "Matches with {Star}" table for that), but their Points column now shows the bare number too (no "pts").
- [x] `app/playground/page.tsx`: both leaderboard asides rewritten as the same table; the Final tables' Points column shows the bare number. `matchesLabel` import removed from both files (unused); `pointsLabel` stays for "Points this round" (+N pts) and the review-points.
- [x] `app/globals.css`: the old `.leaderboard-side .row` / `.score` / `.pts` / `.matches` rules deleted (nothing uses them now); the rank column widened 36px → 56px so the "RANK" heading fits without running into "NAME".
- [x] Verified: `npm run build` passes; local playground screenshot confirms the Rank / Name / Points table with plain numbers and aligned columns.
- **Status**: PUSHED Nov 11 as commit `bd9f5c5` (with Tasks 18–20, 22–25) and VERIFIED LIVE (live chunk page-24cd8ac5d007dfd0.js contains "leaderboard-table" and "Rank"; live CSS contains `th.rank{width:56px}`).

### Task 22: Long unbroken text wraps instead of blowing out past the card (Nov 11, evening)

William, from a screenshot of game JH9T9V (option A was a long unbroken "aaa…sdfsdf…ddd…" string running off the card): "a very long text is broken. it is not wrapped"

- [x] Root cause: a long string with no spaces has no wrap opportunity, so it overflowed. `overflow-wrap: break-word` alone was not enough — the grid columns (`1fr`, implicit `auto`) and the grid items (`min-width: auto`) sized themselves by the word's min-content, so the button itself grew wider than the card.
- [x] Fix (`app/globals.css`): `overflow-wrap: break-word` on `.question-text`, `.opt-text` (guest buttons, host tiles, "You picked"), `.expandable-wrap`, `.result-option .row > span:first-child` (with `min-width: 0`), and `.review-answer` (with `min-width: 0`); the grids now use `minmax(0, 1fr)` — `.options { grid-template-columns: minmax(0, 1fr) }`, `.host-options { grid-template-columns: repeat(2, minmax(0, 1fr)) }` (and the single-column / long-options / mobile variants), `.review-row { grid-template-columns: 150px minmax(0, 1fr) auto }` — and the buttons/tiles got `min-width: 0` so they can shrink below a long word.
- [x] Verified: `npm run build` passes; local playground measurement with a 126-char unbroken string injected into option A: the button's scrollWidth == clientWidth (894) and the card's scrollWidth == clientWidth (926) — no blowout. Screenshots confirm the string wraps across two lines inside the button and the card stays in bounds.
- **Status**: PUSHED Nov 11 as commit `bd9f5c5` (with Tasks 18–21, 23–25) and VERIFIED LIVE (live CSS contains "overflow-wrap" and "minmax(0,1fr)").

### Task 23: Play again moves everyone into the new game's lobby (Nov 11, evening)

William: "hitting 'Play again' doesn't put everyone back into the game lobby of a new game."

- [x] Before this, Play again created a new game with only the host in it; guests had to re-join via a new link the host shared. Now the old game points at the new one and every guest's client follows it on its own.
- [x] Migration `supabase/migrations/0012_replay_code.sql` — applied live and verified: `games.replay_code text` (nullable, CHECK `^[A-Z2-9]{6}$` or null). Additive, so the live client (which did not read it yet) was unaffected.
- [x] `lib/types.ts`: `Game` gains `replay_code: string | null`.
- [x] `lib/use-game.ts` `playAgain`: after creating the new game + host player + session, it updates the OLD game row with `replay_code = newCode` (best-effort — if it fails the host still lands in the new game and can share the link), then navigates. If `game.replay_code` is already set (host still on the old page), it just navigates to the new game instead of creating a second one.
- [x] Guest auto-follow: a `useEffect` watches `game.replay_code`; when set and the client is not the host, it navigates to `/game/<newCode>?replayFrom=<oldCode>` (guarded by a ref so it fires once). The host already navigated in `playAgain`, so only non-hosts follow.
- [x] Guest auto-join: a `useEffect` on the new game page reads the old session from localStorage, then reads the old player's CURRENT role from the DB (the session was written at join time as "guest", so a star picked later would otherwise re-join as a guest — this was caught in the first play-through, where the ★ was lost) and inserts a player row with that name and role, saves the session for the new code, and — if the role is "subject" — points the new game's `subject_player_id` at them, so the old star stays the star and the host can just hit Start. Runs once; a session for the new code (or a reload after joining) skips it. After joining it drops the `?replayFrom` param.
- [x] Fallback: `components/game/FinalCard.tsx` shows a "Continue to the new game" button to non-hosts when `game.replay_code` is set, for a client that missed the automatic follow (e.g. its live connection dropped).
- [x] Verified: `npm run build` passes; full local play-through (`video-test/verify-replay.mjs`, game 8VR96A → new game RXXKRR, 5 rounds): host, Sam, and Julie all landed in the new lobby, Sam still the star (★), host lobby lists all three. The forwarding proxy (`video-test/forward-proxy.js` on 127.0.0.1:18080) + context-level proxy with `bypass: "localhost,127.0.0.1"` is needed for Playwright to reach both the local dev server and Supabase.
- **Status**: PUSHED Nov 11 as commit `bd9f5c5` (with Tasks 18–22, 24, 25) and VERIFIED LIVE (live chunk page-24cd8ac5d007dfd0.js contains "replayFrom" and "Continue to the new game").

### Task 24: Drop ?join=1 from the copied invite link (Nov 11, evening)

William: "also why does 'copy link' include a ?join=1? do we need that?"

- [x] No — the join card shows automatically for anyone who opens a game with no session for it, so a new guest sees the name form either way. `?join=1` only forced players who were already in the game to see the join card ("Continue as X") instead of resuming straight into it.
- [x] `lib/use-game.ts` `copyInvite` now copies the plain URL (`/game/<CODE>`). The `joinParam` / `resumeGame` mechanism is removed (`showJoin = loaded && !!game && !me`), and `components/game/JoinCard.tsx` is now just the name form (its "already in this game" branch is unreachable once the join card only shows when there is no player).
- [x] Verified: `npm run build` passes; the replay play-through joins guests via the clean URL (`/game/<CODE>`, no param) and the join card shows.
- **Status**: PUSHED Nov 11 as commit `bd9f5c5` (with Tasks 18–23, 25) and VERIFIED LIVE (live chunk page-24cd8ac5d007dfd0.js).

### Task 25: Answer review — player names left-aligned (Nov 11, evening)

William, from a screenshot of the Answer review: "i think for these answer review, the player name should be left aligned"

- [x] `app/globals.css`: `.review-name { text-align: right; … }` → `text-align: left;` (the names now sit at the left edge of their column, in line with the Q1/Q2/Q3 headings and the left-aligned answers; the points stay right-aligned).
- [x] Verified: `npm run build` passes.
- **Status**: PUSHED Nov 11 as commit `bd9f5c5` (with Tasks 18–24) and VERIFIED LIVE (live CSS contains `.review-name{text-align:left;…}`).

### Task 26: Running leaderboard heading "Player" (not "Name") (Nov 11, evening)

William: "leaderboard should have 'player' not 'name' to be consistent with the other rtables"

- [x] `components/game/RunningLeaderboard.tsx` and both playground leaderboard asides: the heading is now "Player", matching the Final leaderboard / "Matches with {Star}" tables (which already say "Player"). The rank heading stays "Rank".
- [x] Verified: `npm run build` passes.
- **Status**: PUSHED Nov 11 as commit `b7f0acd` and VERIFIED LIVE (live chunk page-673c03bb213c8054.js contains "Player", 0 ">Name<" in the leaderboard).

### Task 27: Question bank no longer picked on "Host a game" (Nov 12, early morning)

William: "question bank doesnt need to be specified in 'host a game' anymore since its inside"

- [x] `app/page.tsx`: the create form is name-only — the package state, the package loading, and the select are removed. `createGame` inserts `question_package_id: null`; the bank is picked in the lobby's Game setup card (Task 28). The intro copy now reads "The host starts a game, picks the question bank and the star in the lobby…", and How-it-works step 1 matches.
- [x] Verified: `npm run build` passes.
- **Status**: PUSHED Nov 12 as commit `b99ce47` (with Task 28) and VERIFIED LIVE (live chunk page-95f17dc9b3a8f2a3.js contains "Custom only"; the home form has no package picker).

### Task 28: Game setup card redesign — pills, stepper, toggle switch (Nov 12, early morning)

William, with a screenshot of the old setup card: "this game setup design still sucks. can you review it and fix the look and ux"

- [x] `components/game/LobbyCards.tsx` Game setup card: the question bank is now a pill group (`.bank-pills`, flex wrap, gap 8px) — one `.pill` button per package ("Name (N)") plus a "Custom only" pill (`role="radiogroup"` / `role="radio"` + `aria-checked`). Active pill = accent fill + white text; inactive = dark with a 2px border-strong. This replaces BOTH the old select and the "Custom questions only" checkbox (custom-only is just another pill).
- [x] Custom questions: a bordered `.setup-row` ("Per guest") with a **stepper** — `.stepper` with − / value / + buttons (40px, radius 10px), value `.stepper-value` (20px, 700, white, min-width 36px); minus disabled at 0, plus disabled at 10. "Require each guest to add their questions" is a **toggle switch**: `.switch-row` + `.switch` button (`role="switch"`, 52×30px, radius 999px, track #2c3152, `.on` → accent; `.knob` 22px white circle slides left 4px → 26px).
- [x] `app/globals.css`: `.checkbox-row` removed (nothing uses checkboxes anymore). Note: `.muted` was accidentally deleted in the same edit and immediately re-added — it is live and used by LobbyCards/ContributeCard/playground.
- [x] `app/playground/page.tsx`: the mock Game setup card mirrors the real one (pills, stepper, switch).
- [x] Verified: `npm run build` passes; screenshot `video-test/shot-setup-card3.png` (playground lobby view; pills with "Get to Know Me — General (10)" active, stepper at 2, switch off).
- **Status**: PUSHED Nov 12 as commit `b99ce47` (with Task 27) and VERIFIED LIVE (live CSS contains "bank-pills" and "stepper"; live chunk contains "Custom only").

### Task 29: Final tables are single-metric (Nov 12, early morning)

William: "for the final leaderboard for 'Final leaderboard' and 'matches with {star}' remove the other column. It should be final leaderboard with pts and matches with matches"

- [x] `components/game/FinalCard.tsx`: the Final leaderboard table now shows Rank (#) / Player / Points only (the Matches `<th>`/`<td>` removed); the "Matches with {star}" table now shows # / Player / Matches only (the Points `<th>`/`<td>` removed). This supersedes Task 21, whose entry said the final tables "keep their Matches column".
- [x] `app/playground/page.tsx`: both final tables mirrored identically.
- [x] Verified: `npm run build` passes; playground final view headers read ["#","Player","Points"] and ["#","Player","Matches"]; screenshot `video-test/shot-final-tables2.png` (Final leaderboard, Points only).
- **Status**: PUSHED Nov 12 as commit `619d284` (with Tasks 30–31) and VERIFIED LIVE (live chunk page-95f17dc9b3a8f2a3.js).

### Task 30: Duplicate options are refused when creating a question (Nov 12, early morning)

William: "right now you are allowed a duplicate option when creating questions. please add validation for that"

- [x] `lib/custom-questions.ts`: new `hasDuplicateChoices(cq)` — two choices count as the same when they match after trimming and lower-casing, so "Sushi" and " sushi " are a duplicate. Empty choices are skipped (completeness catches those). `insertCustomQuestion` refuses a duplicate at the insert (backstop), returning "Two choices are the same — make each choice different."
- [x] `lib/use-game.ts` `submitContribSlot`: checks `hasDuplicateChoices` right after the completeness check, before any database call, so the error shows at once instead of after the round-trips.
- [x] `app/playground/page.tsx`: the mock wizard mirrors the real one — a `submitContrib` handler validates completeness and duplicates and shows the error (`.error`); Skip still skips without validating.
- [x] Verified: `npm run build` passes; Playwright (`video-test/shot-duplicate-and-press.mjs`) on the playground: typing "Sushi" and " sushi " shows "Two choices are the same — make each choice different.", and fixing the duplicate advances the wizard to slot 2.
- **Status**: PUSHED Nov 12 as commit `619d284` (with Tasks 29, 31) and VERIFIED LIVE (live chunk page-95f17dc9b3a8f2a3.js contains "Two choices are the same").

### Task 31: Every button answers a tap (Nov 12, early morning)

William: "i want feedback on button clicks for every button. I know some have some but not all of them"

- [x] `app/globals.css`: `button:active { transform: scale(0.97); }` — every button presses in the moment it is touched, so no button ever feels dead while its action lands. This is the instant layer; it needs no round-trip.
- [x] The host advance buttons had no working feedback (Reveal results, Skip question, Next question / Show final leaderboard, Play again, Start now) — they fired an async round-trip with no label change and no guard against a double-tap. `lib/use-game.ts` now has a `busyAction` state ("results" | "next" | "skip" | "replay" | "force-start"), set at the start of `showResults`, `nextQuestion`, `skipQuestion`, `playAgain`, and `finishContribution` (the host's "Start now"), cleared in a `finally` after `load()`. Each function also returns early while one is in flight, so a double-tap cannot fire it twice (Play again previously could race and create two new games).
- [x] `components/game/QuestionCard.tsx`, `ResultsCard.tsx`, `FinalCard.tsx`, `ContributeCard.tsx`: the button for the in-flight action shows a "…" label ("Revealing…", "Skipping…", "Loading…", "Starting a new game…", "Starting…") and every advance button is disabled while any action is in flight. The buttons that already had feedback keep theirs (Start game "Starting…", Join "Joining…", Make star "Picking…", Copy invite "Copied", wizard "Saving…", option picks → waiting screen).
- [x] Verified: `npm run build` passes; Playwright (`video-test/shot-duplicate-and-press.mjs`): holding a button down gives computed transform `matrix(0.97, 0, 0, 0.97, 0, 0)`.
- **Status**: PUSHED Nov 12 as commit `619d284` (with Tasks 29–30) and VERIFIED LIVE (live CSS contains "button:active"; live chunk contains "Revealing" and "Starting a new game").

### Task 32: Host adds more questions on the final screen (Nov 12, early morning)

William: "At the end. Can you add an option to add more questions as the host only? Alongside play again"

- [x] `lib/use-game.ts`: `addMoreQuestion(cq)` (host-only) validates completeness and duplicates (same rules as the contribution wizard, Task 30) and inserts the question into `game_questions` after the bank via `insertCustomQuestion` (author = the host), then `load()`. Returns an error string or null. `playAddedQuestions()` resumes the game: status "finished" → "question" at `current_question_index + 1` (the first question past the last one played), status-guarded so a stale tab cannot resume a game that already moved on, and guarded by a `busyAction` ("play-added") so a double-tap cannot fire it twice. Both are exposed on `GameState`.
- [x] `components/game/FinalCard.tsx`: the host's action bar now has "Add more questions" (secondary) alongside "Play again". Tapping it opens a card with the same `CustomQuestionForm`, a list of the questions added so far, an "Add question" button ("Saving…" while it saves), and a "Play these questions (N)" button (disabled until at least one is added; "Starting…" while it resumes). The added list is derived, not stored: `questions.slice(game.current_question_index + 1)` — the questions past the last one played — so it survives a reload and a cancel, and if the host reopens the form after adding, the earlier questions are still counted. The form explains "These play after everything above — the game picks up where it left off, with the new questions added to the end." Non-hosts see no add-more UI.
- [x] `app/playground/page.tsx`: the mock final view mirrors it — "Add more questions" + form + added list + "Play these questions (N)", which jumps to the host view at the first added question (the mock question list is `[...QUESTIONS, ...addedMore]`).
- [x] Verified: `npm run build` passes; full local play-through (`video-test/verify-add-more.mjs`, game Y3CR26): host creates (name-only), picks Quick Test from the bank list, per-guest 0, 2 guests join, star picked, 3 bank questions played to the final screen; host adds "What is Sam's favourite late-night snack?", it lists under "Added so far", "Play these questions" resumes at "Question 4 of 4", guests answer, and the game finishes again with Q4 in the Answer review (screenshot `video-test/shot-add-more-final.png`).
- **Status**: PUSHED Nov 12 as commit `96289ee` (with the bank-list revision) and VERIFIED LIVE (live chunk page-7783704dddd65d8c.js contains "Add more questions" and "Play these questions").

### Task 28 revision: Bank picker is a scrollable list, not pills (Nov 12, early morning)

William: "Also for pills, I'm not too sure of this design as our question bank grows much larger"

- [x] The pill group does not scale: pills wrap into a wall once the bank grows past a handful of packages. Replaced with a scrollable list. `components/game/LobbyCards.tsx` and `app/playground/page.tsx`: the bank is now a `.bank-list` (a bordered container, `max-height: 212px`, `overflow-y: auto`) of `.bank-row` buttons — one row per package with its name and "N questions" count, plus "Custom only" pinned first so it never scrolls out of reach. The selected row is the accent fill. Same `role="radiogroup"` / `role="radio"` + `aria-checked` semantics and the same `updateGame` persistence as the pills.
- [x] `app/globals.css`: `.bank-pills` / `.bank-pills .pill` rules removed; `.bank-list` / `.bank-row` / `.bank-row .count` / `.bank-row.active` added. The generic `.pill` badge (answered-count, QuestionCard) is untouched.
- [x] Verified: `npm run build` passes; the bank list was exercised in the Task 32 play-through (host picked Quick Test from the list) and screenshot `video-test/shot-bank-list.png` (playground lobby; "Custom only" first, "Get to Know Me — General — 10 questions" active, "Test Package — Test — 5 questions").
- **Status**: PUSHED Nov 12 as commit `96289ee` (with Task 32) and VERIFIED LIVE (live CSS contains "bank-list" and "bank-row", 0 "bank-pills"; live chunk contains "bank-list").

### Task 33: Add-more is a modal; the question total does not move until the game resumes (Nov 12, morning)

William, after watching the add-more videos: "'question 3 of 4' got updated before the game continued to the questions. that shouldn't happen. The host I can't see from the video whether the extra questions is just at the bottom or they have to press a button, but I was thinking they press a button which opens up a modal for new questions. I dont know what 'back to results' mean because everything is on the same page"

- [x] **The counter bug**: the progress label in `app/game/[code]/page.tsx` used `questions.length` as the total, so the moment the host added a question the label jumped from "Question 3 of 3" to "Question 3 of 4" — before the game had continued. Fixed: while the game is finished, the total is the questions played so far (`current_question_index + 1`), not every question in the game; the total only becomes 4 once the game resumes at Q4. The same rule now hides the added question from the Answer review (`components/game/FinalCard.tsx` reviews only `questions.slice(0, current_question_index + 1)`) until it has actually been played — it was showing up as "did not answer" before the game continued.
- [x] **Modal, not an inline card**: `components/game/FinalCard.tsx` — the host presses "Add more questions" and a modal opens (`.modal-backdrop` + `.modal`, `role="dialog"`): the form, the "Added so far" list, "Add question" and "Play these questions (N)". The × in the corner closes it and tapping the backdrop does too. The "Back to results" toggle is gone — it meant nothing, since everything is on the same page. "Play these questions" closes the modal as it resumes the game.
- [x] `app/globals.css`: `.modal-backdrop` (fixed overlay, centred, 65% black) + `.modal` (max-width 560px, max-height 88vh, scrolls) + `.modal-close` (36px round ×, top-right).
- [x] `app/playground/page.tsx`: the mock final view mirrors the modal (same × / backdrop close, same buttons).
- [x] Verified: `npm run build` passes; full local play-through (`video-test/verify-task33.mjs`, game 8WLUET): final screen reads "Question 3 of 3"; opening the modal shows `role="dialog"` and no "Back to results" anywhere; after adding a question and closing the modal the label is still "Question 3 of 3" and the review does not show the added question; after "Play these questions" the label is "Question 4 of 4", and finishing again shows Q4 in the review. Screenshot `video-test/shot-add-more-modal.png`.
- **Status**: PUSHED Nov 12 as commit `8c355f7` and VERIFIED LIVE (live chunk page-6146668b4c4a0959.js contains "modal-backdrop", 0 "Back to results"; live CSS contains "modal-backdrop" and "modal-close").

### Task 33 follow-up: Drop the add-more explanation; resume button is just "Play" (Nov 12, morning)

William: "Delete the explanation 'these play...'" / "And the play these questions should just be 'play'" / "Can I confirm when those are done playing, we can continue to add more if we want?"

- [x] The "These play after everything above — the game picks up where it left off, with the new questions added to the end." paragraph is removed from the modal in `components/game/FinalCard.tsx` and the mock modal in `app/playground/page.tsx`. (William's standing taste: strip explanatory copy; the modal's "Added so far" list and the "Play" button show what happens.)
- [x] The resume button is now just "Play" (was "Play these questions (N)") in both the real modal and the mock. The count is still visible in the "Added so far" list.
- [x] Repeatability, confirmed by a real play-through, not just by reading the code: after the added questions are done playing, the game finishes again and "Add more questions" is offered again — the host can add more, play them, and repeat. Verified in `video-test/verify-repeat-add-more.mjs` (game 7X6MPG): 3 bank questions to the final screen, round 1 added Q4 ("late-night snack") and played it to "Question 4 of 4", finished again, then round 2 added Q5 ("dream holiday") and played it to "Question 5 of 5", finished again with Q4 and Q5 both in the Answer review. This works because the added list is derived from the questions past the last one played, so each finish re-opens the same flow.
- **Status**: PUSHED Nov 12 as commit `bd950b2` and VERIFIED LIVE (live chunk page-ee4c7fb363f0d7f0.js contains 0 "These play after everything" and 0 "Play these questions"). Note: the full-snapshot push timed out on GitHub's tree creation ("input too large") even though the repo is only ~480K — pushing just the 3 changed files (FinalCard, playground, IMPLEMENTATION.md) worked. If a full push times out again, push only the changed files.

### Task 34: Setup card hierarchy — "Questions", distinct headings, equal rows (Nov 12, evening)

William: "in lobby, 'Question bank' should just be 'Questions'. Also the text should be more distinguished as a header than the list (or maybe the list is too large). Same with Custom questions section. The config is larger than the heading. Also the per guest row is larger than the other row — we should make them the same. I think we can shrink it a little. its too large."

- [x] "Question bank" → "Questions" (`components/game/LobbyCards.tsx` and `app/playground/page.tsx`, label + `aria-label`). The DB/package concept is still a "question bank" behind the scenes; only the label changed.
- [x] The section headings are now real headers: a new `.setup-label` class (16px, 700, white) on "Questions" and "Custom questions". The plain `label` style (14px, muted) read as a field caption, not a section, and the rows beneath it were larger than the heading.
- [x] Everything below the headings shrank a little: bank rows 15px → 14px, min-height 44px → 40px, padding 10px → 8px, count 13px → 12px; setup rows 16px → 15px, padding 12px → 10px; stepper buttons 40px → 36px, value 20px → 18px.
- [x] The two Custom-questions rows are now the same size (both `min-height: 58px`, same padding, same font). The "Per guest" row was taller because its stepper was 40px while the switch row's control is 30px. The switch label was also shortened from "Require each guest to add their questions" to "Require guests to add questions" so it fits on one line on a phone instead of wrapping and pushing its row taller.
- [x] Verified: `npm run build` passes; measured in the playground lobby (390px phone): "Per guest" row 58px, switch row 58px (was 58px vs 62px before the label shortening). Screenshot `video-test/shot-setup-card4.png`.
- **Status**: implemented and verified locally; push pending.

### Task 35: Lobby layout — setup left / players right, no "Lobby" panel (Nov 12, evening)

William: "also for the host screen i dont like the arrangement. We should just have the players panel on the right side and the game setup on the left (we can make it one column on mobile). Also for guest screens and host screen in general, the lobby panel seems wrong. The lobby is the whole page so we dont really need that panel"

- [x] The separate "Lobby" panel (the card with the `<h2>Lobby</h2>` heading, the Start button and the waiting line) is gone — the lobby is the whole page, so a panel named "Lobby" is redundant.
- [x] The Start button now lives at the bottom of the Game setup card, under the setup the host just configured. The "Guests add N questions each…" note and the no-questions warning moved there too (they are setup facts). The Start button's disabled conditions are unchanged (no star, fewer than 2 players, no package and limit 0).
- [x] The guest waiting line ("Waiting for the host to start…" / "Waiting for the host to pick a star and start…") now lives at the bottom of the Players card, so guests still see it without a Lobby panel.
- [x] Lobby layout: a `.lobby-grid` wraps Players + Game setup. On a wide screen (min-width 768px) it is two columns — Game setup left, Players right. On a phone it is one column, Players first (so the host picks a star) then Game setup with the Start button below. A lone panel (a guest sees Players only) spans the full width.
- [x] Mirrored in the playground lobby view (same grid, same Start-button placement; the mock "Lobby — code MOCK01" heading is now just "Players", the code row stays inside it).
- [x] Verified: `npm run build` passes. Measured in the playground lobby — desktop 1280px: setup left 16px, players left 648px, same row; mobile 390px: single column, Players top 685px, setup top 1189px. Screenshots `video-test/shot-lobby-desktop.png` (setup left / players right) and `video-test/shot-lobby-mobile2.png` (one column, players first).
- **Status**: PUSHED Nov 12 as commit `c177a3d` and VERIFIED LIVE (live chunk page-ab3d836582ae556a.js contains "lobby-grid", "card-players", "card-setup"; live CSS contains "lobby-grid" and "setup-label").

### Task 36: Remove the "Guests add…" line; restore the gap above the lobby grid (Nov 12, evening)

William: "'Guests add 1 question each before the game starts.' you can get rid of this in the lobby. Also if we have enough guests that expand the vertical bar of the lobby, does the game setup also expand or does it stay the same" + (screenshot) "there is no more padding between the game link and the panel"

- [x] The "Guests add N questions each before the game starts." line is removed from the Game setup card (`components/game/LobbyCards.tsx`) and the playground mirror. The stepper already shows the per-guest number, so the line was redundant.
- [x] The missing gap above the lobby was a Task 35 regression: `.lobby-grid > .card { margin: 0; }` removed the cards' normal 16px top margin, so the grid sat flush against the game-code row. Fixed by giving the grid itself the margin back: `.lobby-grid { margin: 16px 0; }` (the cards inside keep `margin: 0` so the two columns stay aligned). Measured on a real game lobby (390px): 20px between the code row and the grid.
- [x] Stretch question, answered by measurement (not just by reading the CSS): YES, the Game setup panel stretches to match the Players panel. In the playground lobby on desktop, with 4 players both cards were 494px tall; after injecting 8 extra guest rows (12 players) both were 1072px. The grid's default `align-items` stretches both cards to the tallest one's height; the content stays top-aligned, so the shorter panel just gets empty space at the bottom. If William wants the setup panel to stay its own height instead, the fix is `align-items: start` on `.lobby-grid`.
- **Status**: PUSHED Nov 12 as commit `3a46daa` and VERIFIED LIVE (live chunk page-e7bd628ca211e88b.js contains 0 "Guests add", "lobby-grid" and "card-setup"; live CSS contains "lobby-grid", "margin:16px 0" and the solid host-option fill #252a47).

### Task 37: Host question options use the guest button style (Nov 12, evening)

William: "for the TV/host screen, can we make the question options to be the same style as the guests"

- [x] The host's option tiles (`.host-option`) were transparent with a 2px dashed border, which read as draft placeholders next to the guests' solid filled buttons. They now use the same style as the guest buttons: solid `#252a47` fill, no border, 12px radius, letter chip on the left with the text beside it. Still read-only (a plain div, `cursor: default`, not a button), so nothing about them invites a tap.
- [x] Kept the TV-appropriate sizing and layout: the host tiles stay larger (24px font, 22px padding) for TV distance and stay in a 2-column grid on a wide screen, while guests stay 1 column on a phone. Same style, scaled for the screen — the host tiles are bigger versions of the guest buttons, not a different design.
- [x] Verified: `npm run build` passes. Screenshots `video-test/shot-host-options.png` (TV: solid 2-column tiles) and `video-test/shot-guest-options.png` (phone: solid 1-column buttons) — the fill, chip and text layout match.
- **Status**: PUSHED Nov 12 as commit `3a46daa` (same push as Task 36) and VERIFIED LIVE (see Task 36's live check — the solid host-option fill #252a47 is in the live CSS).

### Task 38: Clearer dividers in the final Answer review (Nov 12, evening)

William: "for the final answer review card can we have more clear dividers between each answer?" / "show me a screenshot after changes"

- [x] The dividers were 1px `var(--border)` (#2c3152), barely visible against the card surface. Both are now the brighter `var(--border-strong)` (#3a4066), with a little more breathing room: answer rows (`.review-row`) 8px → 10px padding, question blocks (`.review-question`) 12px → 16px top padding. Each answer (the star's pick, then each guest) is now clearly separated from the next, and each question block is clearly separated from the next.
- [x] Verified: `npm run build` passes. Screenshot `video-test/shot-review.png` (playground Final leaderboard, 5 questions) — the divider under each answer row and above each question block is plainly visible.
- **Status**: implemented and verified locally; push pending the user's review.
