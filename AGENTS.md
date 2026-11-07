# AGENTS.md

Guidance for an agent working in this repository.

## Docs to reference

- **ARCHITECTURE.md** — how we plan to implement the system. Consult before writing or planning implementation work.
- **RULES.md** — how the Do You Know Me? game itself works. Consult before implementing any game-logic or scoring behavior.
- **IMPLEMENTATION.md** — the task checklist. Work one task at a time and check it off only when its test passes.

## Workflow

For every task from `IMPLEMENTATION.md`:

1. **Read** whatever is necessary to understand the task: its checklist in `IMPLEMENTATION.md`, the relevant sections of `ARCHITECTURE.md` and `RULES.md`, and any existing related code.
2. **Implement** the task.
3. **Verify** the task: run `npm run build`, run the manual test in the task, and check the scoring edge cases in RULES.md.
4. **Stop for review** before pushing, deploying, or applying a database change. Do not push, deploy, or apply SQL without the user explicitly approving that step. Show the user the diff and the test result first.

If the task requires a schema change, write a new migration in `supabase/migrations/`, get it reviewed, and only apply to Supabase once the user explicitly approves.

## Rules that must not change without review

- Scoring: +2 for matching the subject, +1 for matching the majority, max 3 per question, subject and host score 0.
- Question Packages: a package is a named list of questions, name required, category optional. Questions associate to a package via `package_questions` and can be reused across packages. A game is one whole round of gameplay, picks one package, and plays its questions in defined order, any length. No fixed 10-question pick, no shuffle in v1. Packages are seeded in Supabase for now.
- After submitting, a player goes to a waiting screen, with no back button and no way to change their answer. The host cannot see any player's answer, including the subject's, until Results. Players who have not submitted when the host overrides get 0 and do not count as a vote.
- Host and subject: host is fixed at creation, subject is picked by the host in the lobby, at most one of each per game, enforced by partial unique indexes. Rejoin via the localStorage session, never create a duplicate player row.
- Majority includes the subject. A tie for majority counts all tied options.
- One answer per player per question in v1.
- No user accounts in v1. Do not add Auth without a reviewed plan.
- Never put a Supabase key, token, or password in code, in a doc, in chat, or in a log. Use `.env.local` locally and Vercel env vars in production.
