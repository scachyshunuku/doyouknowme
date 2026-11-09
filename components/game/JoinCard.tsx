"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";

export default function JoinCard({ g }: { g: GameState }) {
  const { game, players, me, joinName, joinBusy, joinError, joinGame, resumeGame, setJoinName } = g;
  if (!game) return null;
  return (
    <>
        <div className="card">
          <h2>Join game {game.code}</h2>
          {me ? (
            <>
              <p>You&apos;re already in this game as <strong>{me.name}</strong>{me.role === "host" ? " (host)" : ""}.</p>
              <button onClick={() => resumeGame()}>Continue as {me.name}</button>
            </>
          ) : (
            <>
              <p>{players.length} player{players.length === 1 ? "" : "s"} in the lobby.</p>
              <label>Your name</label>
              <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="e.g. Sam" maxLength={25} />
              {joinError && <div className="error">{joinError}</div>}
              <button onClick={joinGame} disabled={joinBusy || !joinName.trim()}>{joinBusy ? "Joining…" : "Join game"}</button>
            </>
          )}
        </div>
    </>
  );
}
