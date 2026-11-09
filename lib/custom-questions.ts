import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A guest's own question, added when they join. It is optional: a player
 * can join without one. Custom questions play AFTER the question bank, in
 * an order shuffled at Start (see startGame), and their options shuffle
 * per game like every other question.
 *
 * Storage: one row in `questions` (text + 4 options) and one row in
 * `game_questions`. Custom rows live at order_index >= CUSTOM_ORDER_START,
 * so they always sort after the bank (bank positions are 0..N-1) and never
 * collide with the package copy at Start.
 */

export const CUSTOM_ORDER_START = 1000;

export const MAX_CUSTOM_QUESTION_LENGTH = 140;
export const MAX_CUSTOM_CHOICE_LENGTH = 50;

export type CustomQuestionInput = {
  question: string;
  choices: [string, string, string, string];
};

export function emptyCustomQuestion(): CustomQuestionInput {
  return { question: "", choices: ["", "", "", ""] };
}

export function isCustomQuestionEmpty(cq: CustomQuestionInput): boolean {
  return !cq.question.trim() && cq.choices.every((c) => !c.trim());
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
 * null on success. Inserts the question row first, then the game_questions
 * row at the next free custom slot (max custom order_index + 1, starting
 * at CUSTOM_ORDER_START). Retries once if two joins race on the same slot
 * (the (game_id, order_index) primary key rejects the loser).
 */
export async function insertCustomQuestion(
  sb: SupabaseClient,
  gameId: string,
  cq: CustomQuestionInput,
): Promise<string | null> {
  const clean = cleanCustomQuestion(cq);
  const { data: question, error: qErr } = await sb
    .from("questions")
    .insert({ text: clean.question, options: clean.choices })
    .select("id")
    .single();
  if (qErr || !question) return qErr?.message ?? "Could not save your question.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: maxRows } = await sb
      .from("game_questions")
      .select("order_index")
      .eq("game_id", gameId)
      .gte("order_index", CUSTOM_ORDER_START)
      .order("order_index", { ascending: false })
      .limit(1);
    const nextIndex = (maxRows?.[0]?.order_index ?? CUSTOM_ORDER_START - 1) + 1;
    const { error: gqErr } = await sb
      .from("game_questions")
      .insert({ game_id: gameId, question_id: (question as { id: string }).id, order_index: nextIndex });
    if (!gqErr) return null;
    if (gqErr.code !== "23505" || attempt === 1) return gqErr.message;
    // Another join took this slot — re-read the max and try again.
  }
  return "Could not save your question.";
}
