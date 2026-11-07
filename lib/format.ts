/** "1 pt", "2 pts", "0 pts" — never "1 pts". */
export function pointsLabel(n: number): string {
  return `${n} pt${n === 1 ? "" : "s"}`;
}

/** "1 match", "2 matches". */
export function matchesLabel(n: number): string {
  return `${n} match${n === 1 ? "" : "es"}`;
}
