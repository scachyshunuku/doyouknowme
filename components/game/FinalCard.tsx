"use client";
// One stage of the game, rendered from the shared game state (useGame).
// The status guard lives here, so the page renders every stage
// unconditionally and each card decides whether it shows.
import type { GameState } from "../../lib/use-game";
import { matchesLabel, pointsLabel } from "../../lib/format";
import { computeRoundResult } from "../../lib/scoring";
import { shuffledOptions } from "../../lib/shuffle";
import { renderQuestionText } from "../../lib/template";

export default function FinalCard({ g }: { g: GameState }) {
  const { game, players, questions, answers, myPlayerId, skippedIds, isHost, totals, subjectPlayer, hostPlayer, leaderboard, matchesLeaderboard, playAgain } = g;
  if (!game) return null;
  return (
    <>
      {game.status === "finished" && (
        <>
        <div className="card">
          <h2>Final leaderboard</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Points</th><th className="num">Matches</th></tr></thead>
            <tbody>
              {leaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td className="name">{p.name}{p.id === game.subject_player_id ? " ★" : ""}</td><td className="num">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</td><td className="num">{totals.subjectMatches[p.id] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Matches with {subjectPlayer?.name ?? "the star"}</h2>
          <table className="leaderboard-table">
            <thead><tr><th className="rank">#</th><th>Player</th><th className="num">Matches</th><th className="num">Points</th></tr></thead>
            <tbody>
              {matchesLeaderboard.map((p, i) => (
                <tr key={p.id}><td className="rank">{i + 1}</td><td className="name">{p.name}{p.id === game.subject_player_id ? " ★" : ""}</td><td className="num">{totals.subjectMatches[p.id] ?? 0}</td><td className="num">{pointsLabel(totals.totalPoints[p.id] ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Answer review</h2>
          {questions.map((q, qi) => {
            const qAnswers = answers.filter((a) => a.question_id === q.id);
            const qRound = computeRoundResult(qAnswers, players, game?.subject_player_id ?? null);
            const qOptions = shuffledOptions(q.options, game.id, q.id);
            const starAnswer = qAnswers.find((a) => a.player_id === game.subject_player_id);
            const starPick = starAnswer ? qOptions[starAnswer.option_index] : null;
            const isSkipped = skippedIds.has(q.id);
            return (
              <div className="review-question" key={q.id}>
                <p className="question-text">Q{qi + 1}. {renderQuestionText(q.text, { subject: subjectPlayer?.name ?? null, host: hostPlayer?.name ?? null })}{isSkipped ? " — Skipped" : ""}</p>
                <div className="review-row">
                  <span className="review-name">{subjectPlayer?.name ?? "the star"} ★</span>
                  <span className="review-answer">{starPick ?? "did not answer"}</span>
                  <span className="review-points" />
                </div>
                {players.filter((p) => p.role === "guest").map((p) => {
                  const a = qAnswers.find((x) => x.player_id === p.id);
                  const pick = a ? qOptions[a.option_index] : null;
                  const matchedStar = !isSkipped && a !== undefined && qRound.subjectOption !== null && a.option_index === qRound.subjectOption;
                  return (
                    <div className="review-row" key={p.id}>
                      <span className="review-name">{p.name}{p.id === myPlayerId ? " (you)" : ""}</span>
                      <span className="review-answer">{pick ?? "did not answer"}{matchedStar ? " ✓" : ""}</span>
                      <span className="review-points">+{pointsLabel(isSkipped ? 0 : (qRound.pointsThisRound[p.id] ?? 0))}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {isHost && <div className="action-bar"><button onClick={playAgain}>Play again</button></div>}
        </>
      )}
    </>
  );
}
