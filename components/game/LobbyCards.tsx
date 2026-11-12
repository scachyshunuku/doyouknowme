"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";

export default function LobbyCards({ g }: { g: GameState }) {
  const { game, players, busyStart, busySubjectId, packages, packagesLoaded, lobbyPackageId, isHost, effectivePackageId, customOnly, questionsRequired, effectiveLimit, updateGame, selectSubject, startGame, setSetupPackageId, setSetupLimit, setSetupRequired, setLobbyPackageId } = g;
  if (!game) return null;
  return (
    <>
      {game.status === "lobby" && (
      <div className="card">
        <h2>Players</h2>
        {players.map((p) => (
          <div className="row player-row" key={p.id}>
            <span className="player-name">{p.name}{p.role === "host" && <span className="tag">host</span>}{p.id === game.subject_player_id && <span className="subject-star" title="Star">★</span>}</span>
            <span>
              {isHost && game.status === "lobby" && p.role === "guest" && (
                <button className="small" onClick={() => selectSubject(p.id)} disabled={busySubjectId !== null}>{busySubjectId === p.id ? "Picking…" : "Make star"}</button>
              )}
            </span>
          </div>
        ))}
        {players.length === 0 && <p>No players yet.</p>}
      </div>
      )}

      {game.status === "lobby" && isHost && (
        <div className="card">
          <h2>Game setup</h2>
          <div className="field">
            <label>Question bank</label>
            {/* One tap to pick a bank — no dropdown, no separate checkbox
                that disables the select above it. "Custom only" is just
                another choice in the same group. */}
            <div className="bank-pills" role="radiogroup" aria-label="Question bank">
              {packages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={effectivePackageId === p.id}
                  className={effectivePackageId === p.id ? "pill active" : "pill"}
                  onClick={async () => {
                    setLobbyPackageId(p.id);
                    setSetupPackageId(p.id);
                    await updateGame({ question_package_id: p.id });
                  }}
                >
                  {p.name} ({p.questionCount})
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={customOnly}
                className={customOnly ? "pill active" : "pill"}
                onClick={async () => {
                  setSetupPackageId(null);
                  await updateGame({ question_package_id: null });
                }}
              >
                Custom only
              </button>
            </div>
            {packages.length === 0 && <p className="muted">{packagesLoaded ? "No question packages found. Run supabase/seed_packages.sql in Supabase." : "Loading packages…"}</p>}
          </div>
          <div className="field">
            <label>Custom questions</label>
            <div className="setup-row">
              <span>Per guest</span>
              {/* A stepper, not a dropdown: the number is the thing, and
                  tapping − / + is faster than opening a list of 0–10. */}
              <span className="stepper">
                <button
                  type="button"
                  aria-label="Fewer custom questions per guest"
                  disabled={effectiveLimit === 0}
                  onClick={async () => {
                    const n = effectiveLimit - 1;
                    setSetupLimit(n);
                    if (n === 0) setSetupRequired(false);
                    await updateGame({ custom_question_limit: n, ...(n === 0 ? { custom_questions_required: false } : {}) });
                  }}
                >
                  −
                </button>
                <span className="stepper-value">{effectiveLimit}</span>
                <button
                  type="button"
                  aria-label="More custom questions per guest"
                  disabled={effectiveLimit === 10}
                  onClick={async () => {
                    const n = effectiveLimit + 1;
                    setSetupLimit(n);
                    await updateGame({ custom_question_limit: n });
                  }}
                >
                  +
                </button>
              </span>
            </div>
            <div className="switch-row">
              <span>Require each guest to add their questions</span>
              <button
                type="button"
                role="switch"
                aria-checked={questionsRequired}
                aria-label="Require each guest to add their questions"
                disabled={effectiveLimit === 0}
                className={questionsRequired ? "switch on" : "switch"}
                onClick={async () => {
                  setSetupRequired(!questionsRequired);
                  await updateGame({ custom_questions_required: !questionsRequired });
                }}
              >
                <span className="knob" />
              </button>
            </div>
          </div>
        </div>
      )}

      {game.status === "lobby" && (
        <div className="card">
          <h2>Lobby</h2>
          {isHost && effectiveLimit > 0 && (
            <p>Guests add {effectiveLimit} question{effectiveLimit === 1 ? "" : "s"} each{questionsRequired ? " (required)" : ""} before the game starts.</p>
          )}
          {isHost ? (
            <div className="action-bar"><button onClick={startGame} disabled={busyStart || !game.subject_player_id || players.length < 2 || (!effectivePackageId && effectiveLimit === 0)}>{busyStart ? "Starting…" : "Start game"}</button></div>
          ) : (
            <p>{game.subject_player_id ? "Waiting for the host to start…" : "Waiting for the host to pick a star and start…"}</p>
          )}
          {!effectivePackageId && effectiveLimit === 0 && <p>This game has no question package and guests can&apos;t add  — pick a package or raise the limit.</p>}
        </div>
      )}
    </>
  );
}
