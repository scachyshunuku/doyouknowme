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
- [x] Custom questions (`lib/custom-questions.ts`, `components/CustomQuestionForm.tsx`): the join form (home Join tab and game-page join card) has a collapsed "+ Add your own question (optional)" section — question (max 140 chars) + 4 choices (max 50 each). All five fields or none; a partial fill blocks joining with an error. `{subject}` / `{host}` work in custom text. The question is saved before the player row (a failed save aborts the join, nothing half-created).
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
- **Status**: Done Nov 8, NOT YET PUSHED — no push instruction for this round
