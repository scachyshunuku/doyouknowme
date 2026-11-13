# Do You Know Me? - Game Rules

## Overview

Do You Know Me? is a party quiz game. One person is the star. Everyone else tries to guess what the star would answer. The host runs the game but does not play.

## Terminology

- **Question Package**: a named list of questions you define. Has a name (required).
- **Game**: one whole round of gameplay. Each game you start picks one question package, and plays through that package's questions — copied into the game and shuffled once at Start.

## Players & Roles

- **Host**: 1 per game. Starts the game, picks the question package, picks the star, controls when to move to Results and to the next question. Scores 0. Does not answer. The host is fixed at creation: the person who creates the game is always the host, and there is no host transfer. If the host refreshes or loses connection, they rejoin as host via the session saved on their device.
- **Star**: 1 per game. The main person. Answers every question. Scores 0.
- **Guests**: Any number. Answer every question. Score points.

No user accounts. Players are identified by name and a player id stored in localStorage on their device.

## Joining

- Host starts a game, picks a question package, and shares a 6-letter code. The creator is always the host.
- Everyone else joins with the code, as a guest. There is no join-as-host and no join-as-star.
- The same code is used in the game URL: `/game/<CODE>`.
- Opening an invite link asks who you are: a visitor with no session for that game enters a name and joins as a guest. If you are already in the game, the link offers Continue as yourself. There is no joining as someone else: a player row is never deleted, so a game cannot lose its host or its star to a switch. A plain refresh (no `?join=1`) resumes silently.
- The session is stored in the browser's localStorage, one entry per game code (`doyouknowme:session:<CODE>`). A different browser, profile, or incognito window is a different player; a new tab in the same browser resumes the same player.

## Picking The Star

- In the lobby, the host picks one joined guest to be the star.
- Only the host can do this, and only in the lobby.
- There is only ever one star. Picking a different guest replaces the old star, who goes back to being a guest.
- The game cannot start until a star is picked.

## Refresh & Reconnect

- Your session is saved on your device, so if you refresh, close the tab, or lose connection, you rejoin the same game as the same player, with the same role.
- Your answers are saved in the database, so a refresh does not lose an answer you already submitted.
- You land back on the current stage, question, Results, or Final, not back at the lobby.
- This is per device and browser. Joining from a different phone is a new guest.

## Question Packages & Questions

- A **question package** is a named list of questions you define. A package has a **name** (required).
- Questions are associated to a package, and a question can be reused in more than one package.
- Each question has exactly 4 multiple-choice answers.
- A package can be any length. There is no fixed number of questions.
- Packages are seeded in Supabase for now. There is no in-app package editor in v1.
- When the host starts a game, they pick which question package to play. That package's questions are copied into the game as self-contained rows and shuffled once at Start — the package's defined order is only the seed list, not the play order. Custom questions are added after the bank and shuffled once everyone has finished adding them.
- The existing 10 generic seed questions become one default package, e.g. "Get to Know Me".
- Questions are asked one by one. The host controls when to move on.

### Question templates

- A question's text can contain variables in braces: `{star}` inserts the star's name, `{host}` inserts the host's name. `{subject}` means the same as `{star}` (seeded questions use it). Example: "What is {star}'s favourite food?"
- If the star has not been picked yet, `{subject}` reads as "the star".
- All seeded questions use `{subject}`.
- Custom questions are added after the host hits Start, before the first question: every guest (including the star) goes through their own questions one at a time — a question with 4 choices, then Next question (or Complete on the last one). When questions are optional, each slot also has a Skip button. A slot must be complete to save it; the host never adds questions.
- The host sets all of this in the lobby, and can change it again on a replay: the question package (changeable), Custom questions only (no package — the game plays only what guests contribute), how many questions each guest may add (0–10, default 1; 0 skips the adding step entirely), and whether questions are required (every guest must fill all of their slots, no Skip). Custom questions play after the question bank, in an order shuffled once everyone has finished adding them (server-side, one transaction). Their options shuffle per game like any other question, and `{star}` / `{host}` work in them.

### Host screen (TV) and guest screens (phones)

- The host's screen is meant to be shared on a TV or computer screen: big text, and the 4 options are listed as a read-only list. The host cannot select an answer.
- The 4 options are shuffled for each game: the order is derived from the game and the question, so every player sees the same order, it stays the same if anyone reloads, and a new game gets a new order. Answers are stored as the position in the shown order.
- Guests and the star play on their phones: big tap targets, one question at a time.
- During a game, a running leaderboard sits on the side of the host's screen (stacked below on phones), showing every guest's total points and star matches, most points first. The star and the host are not on it — they score 0 and are not players in the game.
- The players list appears in the lobby only, so the host can pick the star. Once the game starts, the leaderboard is the roster.

## Stages

### 1. Question

- The question and its 4 answers are on screen.
- Everyone except the host has to select an answer, including the star.
- The host does nothing here, and cannot see any player's chosen answer, including the star's, until Results.
- The host can skip the current question (Skip question, next to Reveal results). A skipped question scores no points for anyone and never reaches Results. It stays in the question count (the total does not go down) and appears in the Answer review marked Skipped with +0 pts.
- The host may set a game to custom questions only (no question package). That game plays only what guests contribute, so the per-guest limit must be at least 1. Questions can be optional — but the game needs at least one custom question: if nobody adds one, it returns to the lobby instead of starting, and the host starts again (or makes questions required / picks a package).
- On the final screen the host can play again: Play again starts a fresh game — a new code, the same setup (package, limit, required) and the same host. The star is picked fresh in the new lobby, and guests join it with the new code like any game. The old game stays finished as history.
- A player can only answer once per question. After they choose, they go to a waiting screen, with no option to go back or change their answer. The waiting screen shows only their pick — the leaderboard beside/below it is the standings.
- Lobby identity: the host is tagged "host"; the star gets a gold ★ beside their name, not a tag; guests get no tag. All lobby player rows are the same height.

### 2. Results

- Shown automatically after everyone who is not the host has submitted, or when the host hits Reveal results.
- Points for the current question are calculated and shown only on this screen. While the question is being answered, the running leaderboard counts only earlier questions — no one's points move when someone submits.
- The Results screen shows, for the current question:
  - How many players picked each answer, sorted most answers first
  - The top-voted option(s) highlighted in yellow (no "majority" label)
  - Which answer the star picked, starred (★) with "— {name}'s pick" text and no highlight
  - Which answer you picked, marked "— your pick" (on your own screen only)
  - Points awarded this round, as just "+x pts" per guest — no breakdown, no star/host text
  - Running totals

#### Scoring

For each guest, per question:

- Match the star: **dynamic points** — as many points as there were players who did *not* match the star's answer. "Players" means guests who submitted an answer for that question. The star and the host do not count as players, and non-submitters do not count.
- Match the majority: **+1 point**, stacking on top of the dynamic star points.
- **No maximum per question** (the old max of 3 is gone — confirmed by William Nov 13, 2026).
- Star scores **0**. Host scores **0**.

Majority is defined as the most-chosen option among all non-host answers submitted, **including the star**.

Edge cases:

- **Tie for majority**: If two or more options tie for most-chosen, all tied options count as majority. Each gets +1. Confirmed by William Nov 7, 2026.
- **Star did not answer**: If the host revealed Results before the star answered, no one gets star points for that question. The +1 majority point still applies.
- **Everyone matches the star**: The dynamic star points are 0, but the majority +1 still applies, so each matcher gets 1 point total.
- **Star is the only answer**: The star's answer is also the majority. A guest who matches the star gets the dynamic star points plus +1 for majority.
- **A player did not answer**: If the host reveals Results, anyone who has not submitted gets 0 for that question and does not count as a vote. Majority is calculated only over submitted answers.
- **No answers at all**: No points are awarded. The host can move to the next question.

### 3. Next Question

- The host hits Next Question.
- The game goes back to Stage 1 with the next question.
- After the last question, Next Question moves to the Final stage instead.

### 4. Final Leaderboard

- After all questions have been answered, the game tallies the score and shows two tables:
  1. **Final leaderboard**, ranked by total points, most points first (rank, player, points, matches).
  2. **Matches with the star**, a second table ranked by how many times each player matched the star (rank, player, matches, points). Ties are ordered by points.
- Below the tables, an **Answer review** lists every question in order: the star's pick first, then each guest's pick with the points it earned that round, your own line marked "(you)", and a ✓ when a pick matched the star. A player who did not answer shows "did not answer".
- The star and the host do not appear in either table. The finished screen has no side leaderboard — the two tables are the whole screen.

## Example

Question: "What is my favourite food?" Options: Pizza, Sushi, Tacos, Pasta.

- Star picks Sushi.
- 6 guests answer: Sushi, Sushi, Pizza, Pizza, Pizza, Pizza.
- Majority is Pizza (4 votes; Sushi has 3 counting the star's pick).
- Each guest who picked Sushi matches the star: 6 guests answered, 2 matched, so 4 did not — each matcher gets **4 star points**. Sushi is not the majority, so +0 for majority = **4 points** each.
- Guests who picked Pizza: +0 for matching the star, +1 for majority = 1 point each.
- Guest who picked Tacos, if any: 0 points.

So the rarer the correct guess, the more it is worth: a lone matcher among 6 guests would get 5 star points, while if all 6 matched, each would get 0 star points + 1 for majority = 1 point. (Note the star's own answer counts toward the majority, so a 2–3 split among guests can tie for majority — in that case the matchers also get the +1.)
