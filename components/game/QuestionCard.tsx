"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";

export default function QuestionCard({ g }: { g: GameState }) {
  const { game, questions, me, pendingPick, isHost, currentQuestion, currentAnswers, submittedCount, nonHostPlayers, myAnswer, questionText, displayOptions, busyAction, submitAnswer, showResults, skipQuestion } = g;
  if (!game) return null;
  // Long text gets smaller fonts so a 300-char question or 150-char
  // options stay readable without pushing everything off-screen; long
  // host options also drop to a single column (a list reads better than
  // a tall uneven grid).
  const longQuestion = questionText.length > 150;
  const longOptions = displayOptions.some((o) => o.length > 100);
  return (
    <>
      {game.status === "question" && currentQuestion && (
        <div className="card">
          <h2>Question {game.current_question_index + 1} of {questions.length}</h2>
          <p className={longQuestion ? "question-text long" : "question-text"}>{questionText}</p>
          {me?.role === "host" ? (
            <div>
              <div className={longOptions ? "host-options long-options" : "host-options"}>
                {displayOptions.map((opt, i) => (
                  <div key={i} className="host-option"><span className="opt-letter">{"ABCD"[i]}</span><span className="opt-text">{opt}</span></div>
                ))}
              </div>
            </div>
          ) : (myAnswer || pendingPick !== null) ? (
            <div>
              <h2>✓ Answer locked in</h2>
              <div className={longOptions ? "my-pick long" : "my-pick"}><span className="opt-letter">{"ABCD"[myAnswer ? myAnswer.option_index : (pendingPick as number)]}</span><span className="opt-text">You picked: {displayOptions[myAnswer ? myAnswer.option_index : (pendingPick as number)]}</span></div>
              <p>Waiting for everyone else…</p>
            </div>
          ) : (
            <div className={longOptions ? "options long-options" : "options"}>
              {displayOptions.map((opt, i) => (
                <button key={i} onClick={() => submitAnswer(i)}><span className="opt-letter">{"ABCD"[i]}</span><span className="opt-text">{opt}</span></button>
              ))}
            </div>
          )}
          {/* The count comes from the question row's submitted_count, not
              from counting answer rows — unrevealed answers are hidden by
              RLS (migration 0013), so currentAnswers is empty here. */}
          <p><span className="pill" aria-live="polite">{submittedCount}/{nonHostPlayers.length} answered</span></p>
          {isHost && <div className="action-bar"><button className="secondary" onClick={showResults} disabled={busyAction !== null}>{busyAction === "results" ? "Revealing…" : "Reveal results"}</button><button className="secondary" onClick={skipQuestion} disabled={busyAction !== null}>{busyAction === "skip" ? "Skipping…" : "Skip question"}</button></div>}
        </div>
      )}

    </>
  );
}
