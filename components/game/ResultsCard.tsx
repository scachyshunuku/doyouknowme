"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";
import { pointsLabel } from "../../lib/format";
import ExpandableText from "../ExpandableText";

export default function ResultsCard({ g }: { g: GameState }) {
  const { game, players, questions, isHost, currentQuestion, currentAnswers, myAnswer, round, questionText, sortedResultOptions, busyAction, nextQuestion } = g;
  if (!game) return null;
  const longQuestion = questionText.length > 150;
  return (
    <>
      {game.status === "results" && currentQuestion && round && (
        <div className="card">
          <h2>Results — Question {game.current_question_index + 1}</h2>
          <p className={longQuestion ? "question-text long" : "question-text"}>{questionText}</p>
          {sortedResultOptions.map(({ opt, i, count: total }) => {
            const pct = currentAnswers.length ? Math.round((total / currentAnswers.length) * 100) : 0;
            const isSubjectPick = round.subjectOption === i;
            const isMyPick = myAnswer?.option_index === i;
            return (
              <div key={i} className={`result-option${isSubjectPick ? " top-pick" : ""}`}>
                <div className="row"><span>{isSubjectPick ? "★ " : ""}<ExpandableText text={opt} />{isMyPick ? " — your pick" : ""}</span><span>{total} ({pct}%)</span></div>
                <div className="bar"><div style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          <h2>Points this round</h2>
          {players.filter((p) => p.role === "guest").map((p) => {
            const answered = currentAnswers.some((a) => a.player_id === p.id);
            return (
              <div className="row" key={p.id}>
                <span>{p.name}{!answered ? " — did not answer" : ""}</span>
                <span>+{pointsLabel(round.pointsThisRound[p.id] ?? 0)}</span>
              </div>
            );
          })}
          {isHost && <div className="action-bar"><button onClick={nextQuestion} disabled={busyAction !== null}>{busyAction === "next" ? "Loading…" : game.current_question_index + 1 >= questions.length ? "Show final leaderboard" : "Next question"}</button></div>}
          {!isHost && <p>Waiting for the host…</p>}
        </div>
      )}

    </>
  );
}
