"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";
import CustomQuestionForm from "../CustomQuestionForm";

export default function ContributeCard({ g }: { g: GameState }) {
  const { game, players, me, contribSlot, contribQ, contribBusy, contribError, isHost, customOnly, questionsRequired, effectiveLimit, finishContribution, submitContribSlot, skipContribSlot, setContribQ, subjectPlayer } = g;
  if (!game) return null;
  return (
    <>
      {game.status === "contributing" && (
        <div className="card">
          {isHost ? (
            <>
              <h2>Adding questions…</h2>
              <p>Waiting for everyone to add their questions — {players.filter((p) => p.role !== "host" && p.contribution_done).length} of {players.filter((p) => p.role !== "host").length} done.</p>
              {players.filter((p) => p.role !== "host").map((p) => (
                <div className="row" key={p.id}>
                  <span>{p.name}</span>
                  <span>{p.contribution_done ? "✓ Done" : <span className="muted">Adding…</span>}</span>
                </div>
              ))}
              <div className="action-bar"><button className="secondary" onClick={() => void finishContribution(true)}>Start now</button></div>
            </>
          ) : me?.contribution_done ? (
            <>
              <h2>✓ You&apos;re done</h2>
              <p>Waiting for everyone else to finish adding questions — {players.filter((p) => p.role !== "host" && p.contribution_done).length} of {players.filter((p) => p.role !== "host").length} done.</p>
            </>
          ) : (
            <>
              <h2>Add your questions</h2>
              {!questionsRequired && customOnly && (
                <p>The game needs at least one question to start.</p>
              )}
              <CustomQuestionForm label={`Question ${contribSlot + 1} of ${effectiveLimit}`} value={contribQ} onChange={setContribQ} starName={subjectPlayer?.name ?? null} />
              {contribError && <div className="error">{contribError}</div>}
              <div className="action-bar">
                <button onClick={() => void submitContribSlot(contribSlot + 1 >= effectiveLimit)} disabled={contribBusy}>{contribBusy ? "Saving…" : contribSlot + 1 >= effectiveLimit ? "Complete" : "Next question"}</button>
                {!questionsRequired && <button className="secondary" onClick={() => void skipContribSlot(contribSlot + 1 >= effectiveLimit)} disabled={contribBusy}>Skip</button>}
              </div>
            </>
          )}
        </div>
      )}

    </>
  );
}
