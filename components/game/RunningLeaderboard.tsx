"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";
import { matchesLabel, pointsLabel } from "../../lib/format";

export default function RunningLeaderboard({ g }: { g: GameState }) {
  const { game, players, totals, runningLeaderboard, leaderboard } = g;
  if (!game) return null;
  return (
    <>
      {(game.status === "question" || game.status === "results") && (
        <aside className="card leaderboard-side">
          <h2>Leaderboard</h2>
          {runningLeaderboard.map((p, i) => (
            <div className="row" key={p.id}>
              <span>{i + 1}. {p.name}{p.id === game.subject_player_id ? " ★" : ""}</span>
              <span className="score"><span className="pts">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</span><span>·</span><span className="matches">{matchesLabel(totals.subjectMatches[p.id] ?? 0)}</span></span>
            </div>
          ))}
          {runningLeaderboard.length === 0 && <p>No players yet.</p>}
        </aside>
      )}
    </>
  );
}
