import type { Answer, Player } from "./types";

export interface RoundResult {
  /** option_index -> number of non-host answers for that option */
  counts: number[];
  /** option_index values tied for most-chosen among non-host answers */
  majorityOptions: number[];
  subjectOption: number | null;
  /** player_id -> points awarded this round (0 for host and subject) */
  pointsThisRound: Record<string, number>;
  /** player_id -> true if they matched the subject this round */
  matchedSubject: Record<string, boolean>;
  /** player_id -> true if they matched a majority option this round */
  matchedMajority: Record<string, boolean>;
}

/**
 * Scoring, exactly as specified (dynamic star-match rule, confirmed by
 * William Nov 13, 2026).
 *
 * - Majority is among all non-host answers submitted, INCLUDING the subject.
 *   The host never answers.
 * - A tie for majority: every tied option counts as majority, each gets +1.
 * - A guest who matches the subject's answer gets dynamic star points
 *   equal to the number of players who did NOT match the subject's
 *   answer. "Players" = guests who submitted an answer for this question.
 *   The subject and the host do not count as players, and non-submitters
 *   do not count (they get 0 and are not votes).
 * - A guest also gets +1 if their answer is a majority option. The +1
 *   stacks on top of the dynamic star points.
 * - There is NO maximum per question anymore (the old max of 3 is gone).
 * - The subject always scores 0 points, even if they match the majority.
 * - If the subject did not answer (host overrode to Results), no one can
 *   match the subject, so subject-match points are 0 for everyone, but
 *   majority +1 still applies.
 * - If everyone who answered matches the subject, the dynamic star points
 *   are 0, but the majority +1 still applies, so each matcher gets 1.
 */
export function computeRoundResult(
  answers: Answer[],
  players: Player[],
  subjectPlayerId: string | null,
): RoundResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nonHost = answers.filter((a) => byId.get(a.player_id)?.role !== "host");
  const counts = [0, 0, 0, 0];
  for (const a of nonHost) {
    if (a.option_index >= 0 && a.option_index < 4) counts[a.option_index]++;
  }
  const maxCount = Math.max(...counts);
  const majorityOptions =
    maxCount > 0 ? counts.map((c, i) => (c === maxCount ? i : -1)).filter((i) => i >= 0) : [];
  const subjectAnswer = subjectPlayerId
    ? answers.find((a) => a.player_id === subjectPlayerId) ?? null
    : null;
  const subjectOption = subjectAnswer ? subjectAnswer.option_index : null;

  // Dynamic star points: the number of guests who submitted an answer and
  // did NOT match the subject's answer. The subject and host are not
  // players; non-submitters are not counted (they get 0, not a vote).
  const guestAnswers = nonHost.filter((a) => byId.get(a.player_id)?.role === "guest");
  const dynamicStarPoints =
    subjectOption === null
      ? 0
      : guestAnswers.filter((a) => a.option_index !== subjectOption).length;

  const pointsThisRound: Record<string, number> = {};
  const matchedSubject: Record<string, boolean> = {};
  const matchedMajority: Record<string, boolean> = {};

  for (const a of nonHost) {
    const player = byId.get(a.player_id);
    if (!player) continue;
    if (player.role !== "guest") {
      // Subject (and host, already excluded) score 0.
      pointsThisRound[a.player_id] = 0;
      matchedSubject[a.player_id] = false;
      matchedMajority[a.player_id] = false;
      continue;
    }
    const isSubjectMatch = subjectOption !== null && a.option_index === subjectOption;
    const isMajorityMatch = majorityOptions.includes(a.option_index);
    matchedSubject[a.player_id] = isSubjectMatch;
    matchedMajority[a.player_id] = isMajorityMatch;
    pointsThisRound[a.player_id] =
      (isSubjectMatch ? dynamicStarPoints : 0) + (isMajorityMatch ? 1 : 0);
  }
  return { counts, majorityOptions, subjectOption, pointsThisRound, matchedSubject, matchedMajority };
}

export interface Totals {
  /** player_id -> total points across all answered questions */
  totalPoints: Record<string, number>;
  /** player_id -> number of questions where they matched the subject */
  subjectMatches: Record<string, number>;
}

/** Sum round results across every question in the room. Subject stays at 0. */
export function computeTotals(
  allAnswers: Answer[],
  players: Player[],
  subjectPlayerId: string | null,
  gameQuestionIds: string[],
): Totals {
  const totalPoints: Record<string, number> = {};
  const subjectMatches: Record<string, number> = {};
  for (const p of players) {
    totalPoints[p.id] = 0;
    subjectMatches[p.id] = 0;
  }
  for (const qid of gameQuestionIds) {
    const round = computeRoundResult(
      allAnswers.filter((a) => a.game_question_id === qid),
      players,
      subjectPlayerId,
    );
    for (const [pid, pts] of Object.entries(round.pointsThisRound)) {
      totalPoints[pid] = (totalPoints[pid] ?? 0) + pts;
    }
    for (const [pid, matched] of Object.entries(round.matchedSubject)) {
      if (matched) subjectMatches[pid] = (subjectMatches[pid] ?? 0) + 1;
    }
  }
  // Enforce subject = 0 even if a future change touches the loop above.
  if (subjectPlayerId) totalPoints[subjectPlayerId] = 0;
  return { totalPoints, subjectMatches };
}
