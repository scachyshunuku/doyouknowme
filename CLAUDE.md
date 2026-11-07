# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Docs to reference

- **ARCHITECTURE.md** — how we plan to implement the system. Consult before writing or planning implementation work.
- **RULES.md** — how the Do You Know Me? game itself works. Consult before implementing any game-logic or scoring behavior.
- **IMPLEMENTATION.md** — the task checklist. Work one task at a time and check it off only when its test passes.

## Workflow

For every task from `IMPLEMENTATION.md`:

1. **Read** whatever is necessary to understand what's going on — the task's checklist in `IMPLEMENTATION.md`, the relevant sections of `ARCHITECTURE.md` and `RULES.md`, and any existing related code.
2. **Implement** the task.
3. **Verify** the task: run `npm run build`, run the manual test in the task, and check the scoring edge cases in RULES.md.
4. **Stop for review** before pushing, deploying, or applying a database change. Do not push, deploy, or apply SQL without the user explicitly approving that step. Show the user the diff and the test result first.

If the task requires a schema change, write a new migration in `supabase/migrations/`, get it reviewed, and only apply to Supabase once the user explicitly approves.
