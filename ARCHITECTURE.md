# Do You Know Me? - Architecture Plan

A simple party game using Supabase and Vercel. Players join a game with a 6-letter code. One host, one subject (the main person), any number of guests. No user accounts.

## Terminology

- **Question Package**: a named, user-defined list of questions. Has a name (required) and a category (optional). Example: "Get to Know Me", category "General".
- **Question**: one question in a package, with exactly 4 answers, in a defined order.
- **Game**: one whole round of gameplay. The host starts a game, picks a question package for it, picks the subject in the lobby, and plays through that package's questions in defined order. A game can be replayed with a different package, but each game has exactly one package.

## 1. Tech Stack & Deployment

**Frontend:**
- **Framework**: Next.js 15 (React with App Router)
- **UI**: Plain CSS, mobile-friendly dark UI
- **State Management**: React local state, Supabase Realtime subscriptions
- **Real-time**: Supabase Realtime (WebSocket-based)
- **HTTP Client**: Supabase JS client (`@supabase/supabase-js`)

**Backend:**
- **Primary**: Supabase (PostgreSQL + Realtime)
- **API Routes**: None in v1. The browser client reads and writes Supabase directly, with validation in app code.
- **Hosting**: Vercel

**Key Decision**: Supabase Realtime instead of a separate Socket.io server for simplicity and lower operational overhead. Scores are computed in app code, not stored.

---

## 2. Database Schema

### Core Tables

```sql
question_packages (a named, user-defined list of questions)
├── id (UUID, PK)
├── name (TEXT, required, e.g. "Get to Know Me")
├── category (TEXT, nullable, e.g. "Friends", "Work", "Family")
└── created_at

games (one whole round of gameplay)
├── id (UUID, PK)
├── code (TEXT, unique, 6-char, no I/O/0/1)
├── question_package_id (UUID, FK -> question_packages.id)
├── host_player_id (UUID, NOT NULL, set at creation, never changes)
├── subject_player_id (UUID, nullable until the host picks a subject in the lobby)
├── subject_name (TEXT)
├── status (TEXT: 'lobby', 'question', 'results', 'finished'; validated in app code)
├── current_question_index (INT, default 0)
└── created_at

players (one row per person in a game)
├── id (UUID, PK)
├── game_id (UUID, FK -> games.id, cascade delete)
├── name (TEXT)
├── role (TEXT: 'host', 'subject', 'guest')
└── joined_at

questions (standalone, reusable across packages)
├── id (UUID, PK)
├── text (TEXT)
├── options (JSONB, exactly 4 strings, enforced by check)
└── created_at

package_questions (which questions are in which package, in what order)
├── question_package_id (UUID, FK -> question_packages.id, cascade delete)
├── question_id (UUID, FK -> questions.id, cascade delete)
├── order_index (INT, order inside the package)
└── PK (question_package_id, order_index), unique (question_package_id, question_id)

game_questions (the questions for one game, in package order)
├── game_id (UUID, FK -> games.id, cascade delete)
├── question_id (UUID, FK -> questions.id, cascade delete)
├── order_index (INT)
└── PK (game_id, order_index), unique (game_id, question_id)

answers (one answer per player per question)
├── id (UUID, PK)
├── game_id (UUID, FK -> games.id, cascade delete)
├── question_id (UUID, FK -> questions.id, cascade delete)
├── player_id (UUID, FK -> players.id, cascade delete)
├── option_index (INT: 0-3)
├── created_at
└── unique (game_id, question_id, player_id)
```

### Indexes

```sql
CREATE INDEX idx_players_game_id ON players(game_id);
CREATE INDEX idx_answers_game_question ON answers(game_id, question_id);

-- Enforce at most one host and at most one subject per game, in the database.
-- These are partial unique indexes, so guests are unlimited.
CREATE UNIQUE INDEX uniq_one_host_per_game
  ON players(game_id) WHERE role = 'host';
CREATE UNIQUE INDEX uniq_one_subject_per_game
  ON players(game_id) WHERE role = 'subject';
```

The single-column pointers are the other half of the guarantee: `games.host_player_id` and `games.subject_player_id` can each hold only one player id. The indexes above keep the `players.role` column consistent with those pointers. If two clients try to become subject at the same time, one insert/update fails on the unique index, and the app shows "subject already picked".

### Row Level Security

- RLS is enabled on all seven tables.
- Permissive `anon all` policies: this is a party game with no accounts, so any anon client can read and write rows in a game it knows the code for.
- Do not use the service role key in the browser app.

### Realtime

- Enabled for games, players, answers, game_questions, question_packages, package_questions.
- Clients subscribe to game status changes, new players, and new answers, so every phone updates live without refresh.

### Key Design Decisions

1. **No User Table**: `name` is just a string, no persistent identity. A player id is stored in localStorage on that device.
2. **Session-based IDs**: `player_id` is generated per join, not per account.
3. **Game Code**: A 6-letter code, not the game UUID, is the shareable code used in URLs and invite links.
4. **Host Is Fixed At Creation**: The person who creates the game is the host, always. `games.host_player_id` is set once, never changes, and there is no "join as host" path. Nobody else can become host.
5. **Subject Is Picked By The Host, In The Lobby**: Nobody joins as subject. Everyone except the host joins as a guest. In the lobby, the host picks one joined guest as the subject. Only the host sees that control, and the app only allows the change when the caller's `player_id` equals `games.host_player_id`. Picking a subject sets `games.subject_player_id`, sets that player's role to `subject`, and sets the previous subject, if any, back to `guest`. Start Game is blocked until a subject is picked.
6. **Enforcement Is Two Layers**: The database unique indexes in section 2 are the hard guarantee against two hosts or two subjects, even if two clients race. The host-only check for picking a subject is app-level in v1, because the browser client talks to Supabase directly with permissive anon RLS. A malicious client could in theory call the update directly, but it still cannot create a second subject, because the unique index would reject it. Strong, server-side host-only enforcement would need an API route or a Postgres function with a check on `host_player_id`; that is a future hardening step, not v1.
7. **Question Package Selection**: The host picks a question package when starting a game. On Start Game, that package's questions are copied to `game_questions` in `order_index` order, via `package_questions`. Questions play in defined order, never shuffled in v1. A package can be any length, so the game length is the length of the chosen package. No random 10-question pick in v1.
8. **Questions Are Reusable Across Packages**: A question is standalone in `questions`. It is associated to a package through `package_questions`, with its order in that package. The same question can be in more than one package, at a different position in each. Packages are seeded in Supabase for now, no in-app package editor in v1.
9. **Scores Are Computed**: No `total_points` column in v1. Totals are derived from `answers` plus the subject answer for each question. See RULES.md and `lib/scoring.ts`.

---

## 3. Game Logic Architecture

**Hybrid Model**: Client-side optimistic updates + server-side state in Supabase

```text
CLIENT SIDE
├─ UI Rendering
├─ Answer Selection
├─ Optimistic Updates
└─ Realtime Sync

SUPABASE SIDE
├─ Game State (games.status, current_question_index)
├─ Player List
├─ Answer Persistence
└─ Realtime Broadcast
```

### Game Logic Layers

**Layer 1: Scoring** (`lib/scoring.ts`)
```text
├─ scoreQuestion(answers, subjectAnswer) → per-player points for one question
├─ majorityOptions(answers) → option indexes tied for most-chosen
├─ totalPoints(allAnswers, subjectAnswers) → running totals
└─ subjectMatches(allAnswers, subjectAnswers) → count of matches with subject
```
Used by the Results view and the Final view. See RULES.md for the exact rules.

**Layer 2: Game State** (`app/game/[code]/page.tsx`)
- `createGame` — Pick a question package, create game with `question_package_id` and `host_player_id`, insert host player with role `host`, save the session in localStorage, return code
- `joinGame` — Insert player with role `guest` only. There is no join-as-host or join-as-subject path.
- `selectSubject(playerId)` — Host only, lobby only. Caller must be `games.host_player_id`. Demote the old subject to `guest` if any, promote the chosen guest to `subject`, set `games.subject_player_id`. Blocked after the game starts.
- `startGame` — Blocked until `subject_player_id` is set. Copy the game's package questions to game_questions in order, via `package_questions`, set status to `question`
- `submitAnswer` — Insert one answer, unique per player per question. After submitting, the player goes to a waiting screen, with no option to go back or change the answer.
- `showResults` — Host override, or auto-advance when all non-host players have submitted. A player who has not submitted when the host overrides gets 0 for that question and does not count as a vote. Majority is calculated only over submitted answers.
- `nextQuestion` — Increment `current_question_index`, or set status to `finished` after the last question

**Layer 3: Real-time Synchronization** (`app/game/[code]/page.tsx`)
- Subscribe to Supabase channels for games, players, answers
- On change, reload game state
- Conflict resolution: server state always wins

---

## 4. Real-time Synchronization & Disconnect Handling

### Event Flow

```text
Guest                          Supabase                    Host
  │                               │                           │
  ├─ Picks an answer              │                           │
  │  (optimistic UI)              │                           │
  ├─ INSERT answers               │                           │
  │──────────────────────────────>│                           │
  │                               ├─ Persist                  │
  │                               ├─ REALTIME BROADCAST       │
  │                               │                           │
  │                               ├───────── BROADCAST ──────>│
  │                               │   answer added            │
  │                               │                    Update counts
```

### Disconnect & Reconnect

**Local session (the rejoin mechanism)**

On join or create, the app saves a session in `localStorage` under one key per game:

```text
doyouknowme:session:<CODE> = { player_id, game_id, name, role }
```

On page load for `/game/<CODE>`:

1. Read the stored session for that code, if any.
2. If it exists, fetch that player row by `player_id`. If it is still in the game, restore it as the current player, re-subscribe to Realtime, and show the game in its current stage. No new player row is created, so the player keeps their role, their answers, and their score.
3. If the stored player row is gone, clear the stored session and go through the join flow again, as a guest.
4. If there is no stored session, go through the join flow.

This works for refresh, closing the tab, and a dropped connection. It is per device and per browser, because localStorage is. Joining from a different phone is a new session, and that phone joins as a new guest.

**What is preserved on rejoin**

- Role: host stays host, because `games.host_player_id` still points at the restored player id. Subject stays subject, because `games.subject_player_id` still points at them. A guest stays a guest.
- Answers: answers live in Supabase, not in the browser, so a player who already answered a question sees it as answered after a refresh.
- Game state: the game's status and `current_question_index` live in Supabase, so a rejoining player lands on the current question, Results, or Final, not back at the lobby.

**What is not in v1**

- No heartbeat or presence list, so the UI does not show who is currently online versus who has left. A disconnected player simply stops answering.
- No host transfer. Host is fixed at creation. The way the host stays connected is the localStorage session in this section: refresh or reconnect on the same device restores them as host.
- Host Override: if a player disconnects mid-question, the host can hit Override to Results instead of waiting for them. Players who have not submitted get 0 for that question and do not count as a vote.

---

## 5. Participant & Game Management

### Joining Flow

```text
Host: starts a game, picks a question package
  ↓
INSERT games { code, question_package_id, host_player_id }
INSERT players { game_id, name, role: 'host' }
Save session in localStorage
  ↓
Everyone else: enters name and game code
  ↓
INSERT players { game_id, name, role: 'guest' }
Save session in localStorage
  ↓
[DB Check: partial unique indexes]
  ├─ Host: only one per game, set at creation, no join path
  ├─ Subject: only one per game, set only by the host in the lobby
  └─ Guest: unlimited
  ↓
Broadcast via Realtime: player joined
  ↓
All clients update their player list
```

### Lobby: Picking The Subject

```text
Host sees the guest list in the lobby
  ↓
Host taps "Make subject" on one guest
  ↓
[App Check: caller player_id == games.host_player_id]
[DB Check: unique index, at most one subject per game]
  ↓
Old subject, if any, back to 'guest'
New subject set to 'subject', games.subject_player_id updated
  ↓
Broadcast via Realtime: subject picked
  ↓
Start Game stays disabled until a subject is picked
```

### Stages

- `lobby` — Players join as guests. Host picks the subject, then sees Start Game.
- `question` — Current question and 4 answers on screen. Everyone except the host picks an answer, including the subject. Host does nothing here, and the host cannot see any player's chosen answer, including the subject's, until Results. After a player submits, they see a waiting screen, with no back button and no way to change their answer.
- `results` — Per-answer counts, subject pick, majority pick, points awarded this round, running totals. Players who did not submit before the host overrode get 0 and are not counted as a vote.
- `finished` — Final leaderboard by total points, plus most matches with the subject.

---

## 6. Environment

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

- Set both in Vercel for Production and Preview.
- Do not use the service role key in the browser app.
- Supabase project for v1: doyouknowme, ref `fmmsnucnfuvyjkgszqjn`, region us-east-1.
