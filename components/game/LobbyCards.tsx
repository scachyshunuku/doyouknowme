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
            <select
              value={effectivePackageId ?? lobbyPackageId}
              onChange={async (e) => {
                const id = e.target.value;
                setLobbyPackageId(id);
                setSetupPackageId(id);
                await updateGame({ question_package_id: id });
              }}
              disabled={customOnly}
            >
              {packages.length === 0 ? (
                <option value="">{packagesLoaded ? "No question packages found" : "Loading packages…"}</option>
              ) : packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.questionCount})
                </option>
              ))}
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={customOnly}
                onChange={async (e) => {
                  if (e.target.checked) {
                    setSetupPackageId(null);
                    await updateGame({ question_package_id: null });
                  } else {
                    const id = lobbyPackageId || packages[0]?.id || null;
                    setSetupPackageId(id);
                    await updateGame({ question_package_id: id });
                  }
                }}
              />
              Custom questions only
            </label>
          </div>
          <div className="field">
            <label>Custom questions per guest</label>
            <select
              value={effectiveLimit}
              onChange={async (e) => {
                const n = Number(e.target.value);
                setSetupLimit(n);
                // "Require…" only applies when guests can add ; a
                // limit of 0 clears it so the flag cannot go stale.
                if (n === 0) setSetupRequired(false);
                await updateGame({ custom_question_limit: n, ...(n === 0 ? { custom_questions_required: false } : {}) });
              }}
            >
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={questionsRequired}
                disabled={effectiveLimit === 0}
                onChange={async (e) => { setSetupRequired(e.target.checked); await updateGame({ custom_questions_required: e.target.checked }); }}
              />
              Require each guest to add their questions
            </label>
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
