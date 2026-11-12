"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";

export default function JoinCard({ g }: { g: GameState }) {
  const { game, players, joinName, joinBusy, joinError, joinGame, setJoinName } = g;
  if (!game) return null;
  return (
    <>
        <div className="card">
          <h2>Join game {game.code}</h2>
          <p>{players.length} player{players.length === 1 ? "" : "s"} in the lobby.</p>
          <label>Your name</label>
          <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="e.g. Sam" maxLength={25} />
          {joinError && <div className="error">{joinError}</div>}
          <button onClick={joinGame} disabled={joinBusy || !joinName.trim()}>{joinBusy ? "Joining…" : "Join game"}</button>
        </div>
    </>
  );
}
