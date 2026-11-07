# Do You Know Me? - Game Rules

## Overview

Do You Know Me? is a party quiz game. One person is the subject. Everyone else tries to guess what the subject would answer. The host runs the game but does not play.

## Terminology

- **Question Package**: a named list of questions you define. Has a name (required) and a category (optional, e.g. "Friends", "Work", "Family").
- **Game**: one whole round of gameplay. Each game you start picks one question package, and plays through that package's questions in defined order.

## Players & Roles

- **Host**: 1 per game. Starts the game, picks the question package, picks the subject, controls when to move to Results and to the next question. Scores 0. Does not answer. The host is fixed at creation: the person who creates the game is always the host, and there is no host transfer. If the host refreshes or loses connection, they rejoin as host via the session saved on their device.
- **Subject**: 1 per game. The main person. Answers every question. Scores 0.
- **Guests**: Any number. Answer every question. Score points.

No user accounts. Players are identified by name and a player id stored in localStorage on their device.

## Joining

- Host starts a game, picks a question package, and shares a 6-letter code. The creator is always the host.
- Everyone else joins with the code, as a guest. There is no join-as-host and no join-as-subject.
- The same code is used in the game URL: `/game/<CODE>`.

## Picking The Subject

- In the lobby, the host picks one joined guest to be the subject.
- Only the host can do this, and only in the lobby.
- There is only ever one subject. Picking a different guest replaces the old subject, who goes back to being a guest.
- The game cannot start until a subject is picked.

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

## Stages

### 1. Question

- The question and its 4 answers are on screen.
- Everyone except the host has to select an answer, including the subject.
- The host does nothing here, and cannot see any player's chosen answer, including the subject's, until Results.
- A player can only answer once per question. After they choose, they go to a waiting screen, with no option to go back or change their answer.

### 2. Results

- Shown automatically after everyone who is not the host has submitted, or when the host hits Override to Results.
- The Results screen shows, for the current question:
  - How many players picked each answer
  - Which answer the subject picked
  - Which answer or answers are the majority
  - Points awarded this round
  - Running totals

#### Scoring

For each guest, per question:

- Match the subject: **+2 points**
- Match the majority: **+1 point**
- Maximum: **3 points** per question
- Subject scores **0**. Host scores **0**.

Majority is defined as the most-chosen option among all non-host answers submitted, **including the subject**.

Edge cases:

- **Tie for majority**: If two or more options tie for most-chosen, all tied options count as majority. Each gets +1. Confirmed by William Nov 7, 2026.
- **Subject did not answer**: If the host overrode to Results before the subject answered, no one gets the +2 for that question. The +1 majority point still applies.
- **Subject is the only answer**: The subject's answer is also the majority, so a guest who matches the subject gets +2 and +1, for 3 points.
- **A player did not answer**: If the host overrides to Results, anyone who has not submitted gets 0 for that question and does not count as a vote. Majority is calculated only over submitted answers.
- **No answers at all**: No points are awarded. The host can move to the next question.

### 3. Next Question

- The host hits Next Question.
- The game goes back to Stage 1 with the next question.
- After the last question, Next Question moves to the Final stage instead.

### 4. Final Leaderboard

- After all questions have been answered, the game tallies the score and shows:
  1. **Leaderboard by total points**, most points first. Subject and host are shown with 0 points, or omitted from the ranked list.
  2. **Most matches with the subject**, as a separate stat: the person who selected the most answers the subject selected, counted as a count, not as points. Ties are shown together.

## Example

Question: "What is my favourite food?" Options: Pizza, Sushi, Tacos, Pasta.

- Subject picks Sushi.
- Guests pick: Sushi, Sushi, Pizza, Pizza, Pizza.
- Majority is Pizza (3 votes).
- Guest who picked Sushi: +2 for matching the subject, +0 for majority = 2 points.
- Guests who picked Pizza: +0 for matching the subject, +1 for majority = 1 point each.
- Guest who picked Tacos, if any: 0 points.
