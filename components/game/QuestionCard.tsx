"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";

export default function QuestionCard({ g }: { g: GameState }) {
  const { game, questions, me, pendingPick, isHost, currentQuestion, currentAnswers, nonHostPlayers, myAnswer, questionText, displayOptions, submitAnswer, showResults, skipQuestion } = g;
  if (!game) return null;
  return (
    <>
      {game.status === "question" && currentQuestion && (
        <div className="card">
          <h2>Question {game.current_question_index + 1} of {questions.length}</h2>
          <p className="question-text">{questionText}</p>
          {me?.role === "host" ? (
            <div>
              <div className="host-options">
                {displayOptions.map((opt, i) => (
                  <div key={i} className="host-option"><span className="opt-letter">{"ABCD"[i]}</span>{opt}</div>
                ))}
              </div>
            </div>
          ) : (myAnswer || pendingPick !== null) ? (
            <div>
              <h2>✓ Answer locked in</h2>
              <div className="my-pick">You picked: {displayOptions[myAnswer ? myAnswer.option_index : (pendingPick as number)]}</div>
              <p>Waiting for everyone else…</p>
            </div>
          ) : (
            <div className="options">
              {displayOptions.map((opt, i) => (
                <button key={i} onClick={() => submitAnswer(i)}>{opt}</button>
              ))}
            </div>
          )}
          <p><span className="pill" aria-live="polite">{currentAnswers.length}/{nonHostPlayers.length} answered</span></p>
          {isHost && <div className="action-bar"><button className="secondary" onClick={showResults}>Reveal results</button><button className="secondary" onClick={skipQuestion}>Skip question</button></div>}
        </div>
      )}

    </>
  );
}
