/**
 * Shuffling the 4 options of a question.
 *
 * The order is shuffled per game, not per render: it is derived
 * deterministically from the game id + question id, so every player sees
 * the same order, it stays the same if anyone reloads, and a new game gets
 * a new order. Shuffling on every render would break the game — an answer
 * is stored as its position in the shown order, so the host's TV tiles,
 * the guests' phones, and the Results screen must all agree on one order
 * for the whole question.
 */

/** FNV-1a hash of a string, as an unsigned 32-bit seed. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy of `items`, in an order fixed by `seed`. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A shuffled copy of `items`, in a fresh random order. Used once, when the
 *  host copies a package's questions into a game at Start — the host is the
 *  only client doing the copy, so every client reads the same stored order
 *  afterwards and no seed is needed. */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The option order a question is shown in for one game. */
export function shuffledOptions(options: readonly string[], gameId: string, questionId: string): string[] {
  return seededShuffle(options, `${gameId}:${questionId}`);
}
