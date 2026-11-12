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
          {/* Added questions (Task 32) sit past the last one played until the
              host resumes the game, so they must not move the total before
              the game continues: while finished, the total is the questions
              played so far, not every question in the game. Otherwise the
              label jumps to "Question 3 of 4" the moment one is added. */}
          {(() => {
            const total = game.status === "finished" ? game.current_question_index + 1 : questions.length;
            const done = game.status === "finished" ? total : game.current_question_index + (game.status === "results" ? 1 : 0);
            return (
              <>
                <div className="progress"><div style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
                <p className="progress-label">Question {Math.min(game.current_question_index + 1, total)} of {total}</p>
              </>
            );
          })()}
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
