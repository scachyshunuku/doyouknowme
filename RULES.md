# Do You Know Me? - Game Rules

## Overview

Do You Know Me? is a party quiz game. One person is the star. Everyone else tries to guess what the star would answer. The host runs the game but does not play.

## Terminology

- **Question Package**: a named list of questions you define. Has a name (required) and a category (optional, e.g. "Friends", "Work", "Family").
- **Game**: one whole round of gameplay. Each game you start picks one question package, and plays through that package's questions in defined order.

## Players & Roles

- **Host**: 1 per game. Starts the game, picks the question package, picks the star, controls when to move to Results and to the next question. Scores 0. Does not answer. The host is fixed at creation: the person who creates the game is always the host, and there is no host transfer. If the host refreshes or loses connection, they rejoin as host via the session saved on their device.
- **Star**: 1 per game. The main person. Answers every question. Scores 0.
- **Guests**: Any number. Answer every question. Score points.

No user accounts. Players are identified by name and a player id stored in localStorage on their device.

## Joining

- Host starts a game, picks a question package, and shares a 6-letter code. The creator is always the host.
- Everyone else joins with the code, as a guest. There is no join-as-host and no join-as-star.
- The same code is used in the game URL: `/game/<CODE>`.
- Opening an invite link asks who you are: a visitor with no session for that game enters a name and joins as a guest. If you are already in the game, the link offers Continue as yourself or Join as someone else. A plain refresh (no `?join=1`) resumes silently.
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

- A **question package** is a named list of questions you define. A package has a **name** (required) and a **category** (optional, e.g. "Friends", "Work", "Family").
- Questions are associated to a package, and a question can be reused in more than one package.
- Each question has exactly 4 multiple-choice answers.
- A package can be any length. There is no fixed number of questions.
- Packages are seeded in Supabase for now. There is no in-app package editor in v1.
- When the host starts a game, they pick which question package to play. That package's questions are the questions for that game, in the order you defined them. Questions play in defined order, never shuffled.
- The existing 10 generic seed questions become one default package, e.g. "Get to Know Me", category "General".
- Questions are asked one by one. The host controls when to move on.

### Question templates

- A question's text can contain variables in braces: `{subject}` inserts the star's name, `{host}` inserts the host's name. Example: "What is {subject}'s favourite food?"
- If the star has not been picked yet, `{subject}` reads as "the star".
- All seeded questions use `{subject}`.

### Host screen (TV) and guest screens (phones)

- The host's screen is meant to be shared on a TV or computer screen: big text, and the 4 options are listed as a read-only list. The host cannot select an answer.
- Guests and the star play on their phones: big tap targets, one question at a time.
- During a game, a running leaderboard sits on the side of the host's screen (stacked below on phones), showing every guest's total points and star matches, most points first. The star and the host are not on it — they score 0 and are not players in the game.
- The players list appears in the lobby only, so the host can pick the star. Once the game starts, the leaderboard is the roster.

## Stages

### 1. Question

- The question and its 4 answers are on screen.
- Everyone except the host has to select an answer, including the star.
- The host does nothing here, and cannot see any player's chosen answer, including the star's, until Results.
- A player can only answer once per question. After they choose, they go to a waiting screen, with no option to go back or change their answer.
- The waiting screen shows the standings (running leaderboard), so guests can see the scores while they wait.
- Lobby identity: the host is tagged "host"; the star gets a gold ★ beside their name, not a tag; guests get no tag. All lobby player rows are the same height.

### 2. Results

- Shown automatically after everyone who is not the host has submitted, or when the host hits Reveal results.
- Points for the current question are calculated and shown only on this screen. While the question is being answered, the running leaderboard counts only earlier questions — no one's points move when someone submits.
- The Results screen shows, for the current question:
  - How many players picked each answer, sorted most answers first
  - The top-voted option(s) highlighted in yellow (no "majority" label)
  - Which answer the star picked, starred (★) with "— {name}'s pick" text and no highlight
  - Points awarded this round, as just "+x pts" per guest — no breakdown, no star/host text
  - Running totals

#### Scoring

For each guest, per question:

- Match the star: **+2 points**
- Match the majority: **+1 point**
- Maximum: **3 points** per question
- Star scores **0**. Host scores **0**.

Majority is defined as the most-chosen option among all non-host answers submitted, **including the star**.

Edge cases:

- **Tie for majority**: If two or more options tie for most-chosen, all tied options count as majority. Each gets +1. Confirmed by William Nov 7, 2026.
- **Star did not answer**: If the host revealed Results before the star answered, no one gets the +2 for that question. The +1 majority point still applies.
- **Star is the only answer**: The star's answer is also the majority, so a guest who matches the star gets +2 and +1, for 3 points.
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
- The star and the host do not appear in either table. The finished screen has no side leaderboard — the two tables are the whole screen.

## Example

Question: "What is my favourite food?" Options: Pizza, Sushi, Tacos, Pasta.

- Star picks Sushi.
- Guests pick: Sushi, Sushi, Pizza, Pizza, Pizza.
- Majority is Pizza (3 votes).
- Guest who picked Sushi: +2 for matching the star, +0 for majority = 2 points.
- Guests who picked Pizza: +0 for matching the star, +1 for majority = 1 point each.
- Guest who picked Tacos, if any: 0 points.
