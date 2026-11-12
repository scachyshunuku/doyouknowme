"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import { useState } from "react";
import type { GameState } from "../../lib/use-game";
import { pointsLabel } from "../../lib/format";
import { computeRoundResult } from "../../lib/scoring";
import { shuffledOptions } from "../../lib/shuffle";
import { renderQuestionText } from "../../lib/template";
import { emptyCustomQuestion } from "../../lib/custom-questions";
import type { CustomQuestionInput } from "../../lib/custom-questions";
import CustomQuestionForm from "../CustomQuestionForm";
import ExpandableText from "../ExpandableText";

export default function FinalCard({ g }: { g: GameState }) {
  const { game, players, questions, answers, myPlayerId, skippedIds, isHost, totals, subjectPlayer, hostPlayer, leaderboard, matchesLeaderboard, busyAction, playAgain, addMoreQuestion, playAddedQuestions } = g;
  // Host-only "Add more questions" (Task 32): the form lives on the
  // finished screen, next to Play again. Added questions are the ones
  // past the last one played (current_question_index), so the list is
  // derived from the data — it survives a reload and a cancel.
  const [addingMore, setAddingMore] = useState(false);
  const [addQ, setAddQ] = useState<CustomQuestionInput>(emptyCustomQuestion());
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  if (!game) return null;
  const addedQuestions = game.status === "finished" ? questions.slice(game.current_question_index + 1) : [];
  async function submitAddMore() {
    setAddBusy(true); setAddError("");
    const err = await addMoreQuestion(addQ);
    setAddBusy(false);
    if (err) return setAddError(err);
    setAddQ(emptyCustomQuestion());
  }
  return (
    <>
      {game.status === "finished" && (
        <>
        <div className="card">
          <h2>Final leaderboard</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Points</th></tr></thead>
            <tbody>
              {leaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td className="name">{p.name}{p.id === game.subject_player_id ? " ★" : ""}</td><td className="num">{totals.totalPoints[p.id] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Matches with {subjectPlayer?.name ?? "the star"}</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Matches</th></tr></thead>
            <tbody>
              {matchesLeaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td className="name">{p.name}{p.id === game.subject_player_id ? " ★" : ""}</td><td className="num">{totals.subjectMatches[p.id] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Answer review</h2>
          {/* Only the questions actually played: a question the host added
              (Task 32) sits past the last one played until the game resumes,
              so it must not show up here — or in the "Question X of Y"
              total — before it has been played. */}
          {questions.slice(0, game.current_question_index + 1).map((q, qi) => {
            const qAnswers = answers.filter((a) => a.game_question_id === q.id);
            const qRound = computeRoundResult(qAnswers, players, game?.subject_player_id ?? null);
            const qOptions = shuffledOptions(q.options, game.id, q.id);
            const starAnswer = qAnswers.find((a) => a.player_id === game.subject_player_id);
            const starPick = starAnswer ? qOptions[starAnswer.option_index] : null;
            const isSkipped = skippedIds.has(q.id);
            // Custom questions render as-is (the author typed the actual
            // name); bank questions are templates ({subject}/{host}).
            const reviewText = q.is_custom
              ? q.text
              : renderQuestionText(q.text, { subject: subjectPlayer?.name ?? null, host: hostPlayer?.name ?? null });
            return (
              <div className="review-question" key={q.id}>
                <p className={reviewText.length > 150 ? "question-text long" : "question-text"}>Q{qi + 1}. {reviewText}{isSkipped ? " — Skipped" : ""}</p>
                <div className="review-row">
                  <span className="review-name">{subjectPlayer?.name ?? "the star"} ★</span>
                  <span className="review-answer">{starPick ? <ExpandableText text={starPick} /> : "did not answer"}</span>
                  <span className="review-points" />
                </div>
                {players.filter((p) => p.role === "guest").map((p) => {
                  const a = qAnswers.find((x) => x.player_id === p.id);
                  const pick = a ? qOptions[a.option_index] : null;
                  const matchedStar = !isSkipped && a !== undefined && qRound.subjectOption !== null && a.option_index === qRound.subjectOption;
                  return (
                    <div className="review-row" key={p.id}>
                      <span className="review-name">{p.name}{p.id === myPlayerId ? " (you)" : ""}</span>
                      <span className="review-answer">{pick ? <ExpandableText text={pick} /> : "did not answer"}{matchedStar ? " ✓" : ""}</span>
                      <span className="review-points">+{pointsLabel(isSkipped ? 0 : (qRound.pointsThisRound[p.id] ?? 0))}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {isHost && (
          <div className="action-bar">
            <button className="secondary" onClick={() => { setAddingMore(true); setAddError(""); }}>Add more questions</button>
            <button onClick={playAgain} disabled={busyAction !== null}>{busyAction === "replay" ? "Starting a new game…" : "Play again"}</button>
          </div>
        )}
        {/* "Add more questions" is a modal, not an inline card: the host
            presses the button, the dialog opens for the new questions, and
            the × (or tapping outside) closes it. There is no "Back to
            results" — everything is on the same page, so that label meant
            nothing. */}
        {isHost && addingMore && (
          <div className="modal-backdrop" onClick={() => setAddingMore(false)}>
            <div className="modal" role="dialog" aria-label="Add more questions" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="modal-close" aria-label="Close" onClick={() => setAddingMore(false)}>×</button>
              <h2>Add more questions</h2>
              {addedQuestions.length > 0 && (
                <>
                  <p>Added so far:</p>
                  {addedQuestions.map((q, i) => (
                    <div className="row" key={q.id}><span>{i + 1}. {q.text}</span></div>
                  ))}
                </>
              )}
              <CustomQuestionForm label={`Question ${addedQuestions.length + 1}`} value={addQ} onChange={setAddQ} starName={subjectPlayer?.name ?? null} />
              {addError && <p className="error">{addError}</p>}
              <div className="action-bar">
                <button onClick={() => void submitAddMore()} disabled={addBusy}>{addBusy ? "Saving…" : "Add question"}</button>
                <button onClick={async () => { await playAddedQuestions(); setAddingMore(false); }} disabled={addedQuestions.length === 0 || busyAction !== null}>{busyAction === "play-added" ? "Starting…" : "Play"}</button>
              </div>
            </div>
          </div>
        )}
        {/* The host already replayed and this client missed the automatic
            follow (e.g. its live connection dropped): offer the new game
            instead of leaving it stranded on the finished screen. */}
        {!isHost && game.replay_code && <div className="action-bar"><button onClick={() => { window.location.href = `/game/${game.replay_code}?replayFrom=${game.code}`; }}>Continue to the new game</button></div>}
        </>
      )}
    </>
  );
}
