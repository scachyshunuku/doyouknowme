"use client";
// Thin shell: all game state, live updates and actions live in useGame
// (lib/use-game.ts); each stage of the game is its own component under
// components/game/. The page only wires the shell (code row, progress bar,
// the join-vs-game switch) together.
import { useParams } from "next/navigation";
import { useGame } from "../../../lib/use-game";
import JoinCard from "../../../components/game/JoinCard";
import LobbyCards from "../../../components/game/LobbyCards";
import ContributeCard from "../../../components/game/ContributeCard";
import QuestionCard from "../../../components/game/QuestionCard";
import ResultsCard from "../../../components/game/ResultsCard";
import FinalCard from "../../../components/game/FinalCard";
import RunningLeaderboard from "../../../components/game/RunningLeaderboard";

export default function GamePage() {
  const params = useParams();
  const code = String(params.code ?? "").toUpperCase();
  const g = useGame(code);
  const { game, loaded, error, isHost, questions, copied, copyInvite, showJoin } = g;

  if (error && !game) return <main><div className="error">{error}</div><p><a href="/">Back home</a></p></main>;
  if (!game || !loaded) return <main><p>Loading game…</p></main>;

  return (
    <main className={isHost ? "tv" : "mobile"}>
      <div className="code-row">
        <div className="code">{game.code}</div>
        <button className="small secondary" onClick={copyInvite}>{copied ? "Copied ✓" : "Copy invite link"}</button>
      </div>
      {questions.length > 0 && game.status !== "lobby" && game.status !== "contributing" && (
        <div>
          <div className="progress"><div style={{ width: `${Math.round(((game.status === "finished" ? questions.length : game.current_question_index + (game.status === "results" ? 1 : 0)) / questions.length) * 100)}%` }} /></div>
          <p className="progress-label">Question {Math.min(game.current_question_index + 1, questions.length)} of {questions.length}</p>
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {showJoin ? (
        <JoinCard g={g} />
      ) : (
      <div className={game.status === "question" || game.status === "results" ? "game-layout with-leaderboard" : "game-layout"}>
      <div className="game-main">
      <LobbyCards g={g} />
      <ContributeCard g={g} />
      <QuestionCard g={g} />
      <ResultsCard g={g} />
      <FinalCard g={g} />
      </div>
      <RunningLeaderboard g={g} />
      </div>
      )}
    </main>
  );
}
