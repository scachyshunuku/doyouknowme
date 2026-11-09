import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A guest's own question, added in the contribution phase (after Start,
 * before the first question). Custom questions play AFTER the question
 * bank, in an order shuffled once when everyone is done (the
 * finish_contribution RPC), and their options shuffle per game like every
 * other question.
 *
 * Storage: one row in `game_questions` only — the full question (text +
 * 4 options) is copied in and marked is_custom, with the author recorded
 * (created_by_player_id) so the per-guest limit is checkable. The shared
 * `questions` bank is never touched: a custom question belongs to this
 * game and no other. Its order_index is the next slot after the bank
 * (bank positions are 0..N-1), so customs always sort after the bank.
 */

export const MAX_CUSTOM_QUESTION_LENGTH = 140;
export const MAX_CUSTOM_CHOICE_LENGTH = 50;

export type CustomQuestionInput = {
  question: string;
  choices: [string, string, string, string];
};

export function emptyCustomQuestion(): CustomQuestionInput {
  return { question: "", choices: ["", "", "", ""] };
}

export function isCustomQuestionComplete(cq: CustomQuestionInput): boolean {
  return Boolean(cq.question.trim()) && cq.choices.every((c) => c.trim());
}

/** Trim + cap lengths, so a saved custom question can never exceed the limits. */
export function cleanCustomQuestion(cq: CustomQuestionInput): CustomQuestionInput {
  return {
    question: cq.question.trim().slice(0, MAX_CUSTOM_QUESTION_LENGTH),
    choices: cq.choices.map((c) => c.trim().slice(0, MAX_CUSTOM_CHOICE_LENGTH)) as [string, string, string, string],
  };
}

/**
 * Save a guest's custom question for a game. Returns an error message, or
 * null on success. Inserts the full question into `game_questions` at the
 * next free slot after the bank (max order_index + 1). Retries once if two
 * guests race on the same slot (the (game_id, order_index) unique
 * constraint rejects the loser).
 */
export async function insertCustomQuestion(
  sb: SupabaseClient,
  gameId: string,
  cq: CustomQuestionInput,
  authorId: string,
): Promise<string | null> {
  const clean = cleanCustomQuestion(cq);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: maxRows } = await sb
      .from("game_questions")
      .select("order_index")
      .eq("game_id", gameId)
      .order("order_index", { ascending: false })
      .limit(1);
    const nextIndex = (maxRows?.[0]?.order_index ?? -1) + 1;
    const { error: gqErr } = await sb
      .from("game_questions")
      .insert({ game_id: gameId, text: clean.question, options: clean.choices, order_index: nextIndex, is_custom: true, created_by_player_id: authorId });
    if (!gqErr) return null;
    if (gqErr.code !== "23505" || attempt === 1) return gqErr.message;
    // Another guest took this slot — re-read the max and try again.
  }
  return "Could not save your question.";
}
