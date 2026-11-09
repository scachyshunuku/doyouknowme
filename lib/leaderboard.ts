import type { Player } from "./types";
import type { Totals } from "./scoring";

/**
 * The players who appear on a leaderboard: everyone except the host (who
 * never scores) and the star (who always scores 0).
 */
export function leaderboardPlayers(players: Player[], hostId: string | null, subjectId: string | null): Player[] {
  return players.filter((p) => p.role !== "host" && p.id !== subjectId && p.id !== hostId);
}

/** Most points first; star matches break ties. (Running leaderboard.) */
export function sortByPointsThenMatches(players: Player[], totals: Totals): Player[] {
  return [...players].sort(
    (a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0) || (totals.subjectMatches[b.id] ?? 0) - (totals.subjectMatches[a.id] ?? 0),
  );
}

/** Most points first. (Final leaderboard.) */
export function sortByPoints(players: Player[], totals: Totals): Player[] {
  return [...players].sort((a, b) => (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0));
}

/** Most star matches first; points break ties. (Matches leaderboard.) */
export function sortByMatches(players: Player[], totals: Totals): Player[] {
  return [...players].sort(
    (a, b) => (totals.subjectMatches[b.id] ?? 0) - (totals.subjectMatches[a.id] ?? 0) || (totals.totalPoints[b.id] ?? 0) - (totals.totalPoints[a.id] ?? 0),
  );
}
