"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";

export default function RunningLeaderboard({ g }: { g: GameState }) {
  const { game, totals, runningLeaderboard } = g;
  if (!game) return null;
  return (
    <>
      {(game.status === "question" || game.status === "results") && (
        <aside className="card leaderboard-side">
          <h2>Leaderboard</h2>
          {runningLeaderboard.length === 0 ? (
            <p>No players yet.</p>
          ) : (
            <table className="leaderboard-table">
              <thead><tr><th className="rank">Rank</th><th>Player</th><th className="num">Points</th></tr></thead>
              <tbody>
                {runningLeaderboard.map((p, i) => (
                  <tr key={p.id}>
                    <td className="rank">{i + 1}</td>
                    <td className="name">{p.name}{p.id === game.subject_player_id ? " ★" : ""}</td>
                    <td className="num">{totals.totalPoints[p.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </aside>
      )}
    </>
  );
}
